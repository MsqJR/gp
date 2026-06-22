# Frontend Architecture Integration Plan

This document details the frontend implementation requirements, required component structures, API endpoints to consume, and state management expectations for the third-party integrations (Google OAuth2, Google Maps, Stripe, and Fawry).

---

## 1. Frontend Implementation Requirements

### 1.1 Google OAuth2
- Integration of Google Identity Services library to render a standard "Sign in with Google" button.
- Support for authenticating both Tenant Admins (redirecting to dashboard) and Public Visitors (on tenant subdomains).
- Upon successful login, the frontend must exchange the Google `id_token` with the backend API to receive JWT tokens.
- Handle OAuth cancellation or rejection gracefully with a fallback notification.
- Handle onboarding redirection if the backend returns `is_onboarding_completed: false`.

### 1.2 Google Maps Integration
- **Location Picker (Dashboard)**:
  - Render an interactive map allowing the user to search for addresses and place/drag a location marker.
  - Expose marker coordinates (latitude, longitude) and format the address text, auto-updating on pin change.
  - Save the location settings to the tenant's profile.
- **Location Display (Public Site Contact Page)**:
  - Fetch coordinates from the tenant website profile setup and display a read-only Google Map centered on the marker.
  - Provide a fallback static text address and an error fallback if Google Maps fails to load.
- **Checkout Address Picker with Auto-Geocoding**:
  - Embed a map pin selector in the shipping address step of the checkout page.
  - Query Google Geocoding API (`https://maps.googleapis.com/maps/api/geocode/json?latlng=...`) upon marker placement to automatically populate shipping address text fields (street, city, state).

### 1.3 Stripe Payment Elements
- Use official `@stripe/stripe-js` and `@stripe/react-stripe-js` packages.
- Embed secure Stripe card input fields (`CardElement` or unified `PaymentElement`) directly inside the checkout UI, avoiding external redirects.
- Query the backend to retrieve the `client_secret` of a `PaymentIntent`, pass it to the Stripe SDK, and finalize checkout client-side.

### 1.4 Fawry Reference Code Checkout
- Allow the user to select Fawry as the payment method.
- Submit checkout data to the backend to generate a Fawry reference code.
- Present the reference code, payment instructions, and expiry date to the customer in a clear invoice/receipt card.

---

## 2. Component Structures

The components must follow the existing pattern in `frontend/components/ui/` or workspace guidelines.

### 2.1 Google Authentication Button
- **Path**: `frontend/components/ui/GoogleSignInButton.tsx`
- **Props**:
  ```typescript
  interface GoogleSignInButtonProps {
    onSuccess: (idToken: string) => void;
    onError: (error: string) => void;
  }
  ```
- **Description**: Loads the Google client script and initializes standard button container styling.

### 2.2 Google Maps Components
- **Location Picker Component**:
  - **Path**: `frontend/components/ui/GoogleMapsPicker.tsx`
  - **Props**:
    ```typescript
    interface GoogleMapsPickerProps {
      initialLat?: number;
      initialLng?: number;
      onChange: (lat: number, lng: number, address: string) => void;
    }
    ```
- **Location View Component**:
  - **Path**: `frontend/components/ui/GoogleMapsView.tsx`
  - **Props**:
    ```typescript
    interface GoogleMapsViewProps {
      latitude: number;
      longitude: number;
      businessName: string;
    }
    ```
- **Checkout Map Pin Component**:
  - **Path**: `frontend/components/ui/CheckoutAddressMap.tsx`
  - **Props**:
    ```typescript
    interface CheckoutAddressMapProps {
      onAddressResolved: (addressDetails: {
        formattedAddress: string;
        street?: string;
        city?: string;
        postalCode?: string;
      }) => void;
    }
    ```

### 2.3 Checkout Payment Components
- **Stripe Checkout Form**:
  - **Path**: `frontend/components/ui/StripeElementsWrapper.tsx`
  - **Props**:
    ```typescript
    interface StripeElementsWrapperProps {
      clientSecret: string;
      amount: number;
      onSuccess: (paymentIntentId: string) => void;
      onFailure: (errorMsg: string) => void;
    }
    ```
- **Fawry Code Display**:
  - **Path**: `frontend/components/ui/FawryPaymentInstructions.tsx`
  - **Props**:
    ```typescript
    interface FawryPaymentInstructionsProps {
      referenceCode: string;
      expireAt: number;
      instructions: string;
      amount: number;
    }
    ```

---

## 3. API Endpoints to Consume

Frontend clients must send/receive payloads as defined in [api-endpoints.md](file:///home/mark/Medify_/backend/specs/001-third-party-integrations/contracts/api-endpoints.md):

1. **Google Login**: `POST /api/auth/google/`
   - Request: `{ id_token: string }`
   - Response: Access token, Refresh token, and user model containing `is_onboarding_completed`.
2. **Onboarding**: `POST /api/auth/onboarding/`
   - Headers: `Authorization: Bearer <access_token>`
   - Request: `{ business_type: string, subdomain: string, business_name: string }`
3. **Save Location**: `PUT /api/business-info/{subdomain}/`
   - Headers: `Authorization: Bearer <access_token>`
   - Request: `{ latitude: number, longitude: number, address: string }`
4. **Create Stripe Payment Intent**: `POST /api/payments/stripe/create-intent/`
   - Request: `{ website_setup_id: string, amount: number, currency: "egp" }`
   - Response: `{ client_secret: string, transaction_id: string }`
5. **Create Fawry Reference Code**: `POST /api/payments/fawry/create-code/`
   - Request: `{ website_setup_id: string, amount: number }`
   - Response: `{ reference_code: string, expire_at: number, payment_instructions: string }`

---

## 4. State Management Expectations

### 4.1 Auth & Onboarding Lifecycle
- Maintain authenticated user details and JWT tokens in standard React Context (`AuthContext`).
- Validate `is_onboarding_completed` flag on user login response:
  - If `false`, store the user profile and block navigation to other dashboard routes.
  - Redirect the user to `/dashboard/onboarding` to enforce selection of business type (`hospital` or `pharmacy`) and creation of their custom subdomain site.
  - Once onboarding is successful, transition `is_onboarding_completed` to `true` and redirect to standard dashboard homepage.

### 4.2 Checkout State Engine
Manage the checkout workflow state:
1. **Selection State**: Tracks user's chosen payment method: `'stripe'` or `'fawry'`.
2. **Address Resolution**: Tracks geo-state during map interaction. Triggers API request lock/loaders to prevent checkout submission while coordinates are resolving.
3. **Processing State**:
   - For Stripe: Disables inputs while processing `confirmCardPayment` through Stripe SDK.
   - For Fawry: Triggers backend request, saves reference code response, and displays invoice.
