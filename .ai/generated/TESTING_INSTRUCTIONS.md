# Testing Instructions

## Quick Test Script

Use these commands to quickly verify all fixes are working.

### Prerequisites

1. Backend server running on `http://localhost:8000`
2. Frontend server running on `http://localhost:3000`
3. User account created and logged in

### Test 1: Business Info Persistence

#### Using Browser

1. Open `http://localhost:3000/dashboard/business-info`
2. Fill in the form:
   - Business Name: "Test Pharmacy"
   - About: "A test pharmacy for verification"
   - Address: "123 Test Street"
   - Contact Phone: "555-1234"
   - Contact Email: "test@pharmacy.com"
3. Click "Publish Website"
4. Wait for success message
5. **Refresh the page (F5)**
6. ✅ Verify all data is still present

#### Using API (Python)

```python
import requests
import json

# Get your access token from browser localStorage
token = "YOUR_ACCESS_TOKEN_HERE"
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Test GET
response = requests.get('http://localhost:8000/api/business-info/', headers=headers)
print(f"GET Status: {response.status_code}")
print(f"Data: {response.json()}")

# Test PATCH
data = {
    'name': 'Test Pharmacy',
    'about': 'Testing persistence',
    'contact_phone': '555-1234'
}
response = requests.patch('http://localhost:8000/api/business-info/', 
                         headers=headers, 
                         data=json.dumps(data))
print(f"PATCH Status: {response.status_code}")
print(f"Updated: {response.json()}")

# Verify persistence
response = requests.get('http://localhost:8000/api/business-info/', headers=headers)
print(f"Verify Status: {response.status_code}")
print(f"Persisted Data: {response.json()}")
```

### Test 2: CSV Product Import

#### Create Test CSV File

Create a file named `test_products.csv`:

```csv
name,category,description,price,stock,image_url
Aspirin 500mg,Pain Relief,Fast pain relief,5.99,100,https://placehold.co/600x400/png?text=Aspirin
Vitamin C 1000mg,Vitamins,Immune system support,12.99,50,
Ibuprofen 200mg,Pain Relief,Anti-inflammatory,8.49,75,https://placehold.co/600x400/png?text=Ibuprofen
Multivitamin,Vitamins,Daily nutrition,15.99,60,https://placehold.co/600x400/png?text=Multivitamin
Hand Sanitizer,Hygiene,Antibacterial gel,3.99,200,invalid-url
```

Notes:
- CSV image header can be `image_url`, `Image`, or `Image Link`.
- Invalid image URLs are ignored; valid rows still import.

#### Using Browser

1. Open `http://localhost:3000/dashboard/pharmacy/setup`
2. Click "Import products (CSV)"
3. Select your `test_products.csv` file
4. Wait for "Products saved successfully" message
5. ✅ Verify products appear in the list below
6. Navigate to your template (e.g., `/templates/pharmacy/3/medications`)
7. ✅ Verify products are visible in the template
8. ✅ Verify products with valid image URLs show images; invalid/missing image URLs show fallback UI

#### Using API (Python)

```python
import requests
import json

token = "YOUR_ACCESS_TOKEN_HERE"
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Prepare products data
products = [
    {
        'name': 'Test Product 1',
        'category': 'Test Category',
        'description': 'Test description',
        'image_url': 'https://placehold.co/600x400/png?text=Test+Product+1',
        'price': 10.99,
        'stock': 50
    },
    {
        'name': 'Test Product 2',
        'category': 'Test Category',
        'description': 'Another test',
        'image_url': 'invalid-url',
        'price': 15.99,
        'stock': 30
    }
]

# Bulk upload
response = requests.post('http://localhost:8000/api/pharmacy/products/bulk_upload/',
                        headers=headers,
                        data=json.dumps({'products': products}))
print(f"Upload Status: {response.status_code}")
print(f"Response: {response.json()}")

# Verify products were created
response = requests.get('http://localhost:8000/api/pharmacy/products/', headers=headers)
data = response.json()
print(f"Total Products: {data.get('count')}")
print(f"Products in page: {len(data.get('results', []))}")
```

### Test 3: Template Product Display

#### Using Browser

1. Log in to your account
2. Import some products (see Test 2)
3. Navigate to your pharmacy template:
   - Template 1: `/templates/pharmacy/1`
   - Template 2: `/templates/pharmacy/2`
   - Template 3: `/templates/pharmacy/3`
4. Click on "Products" or "Medications" link
5. ✅ Verify your imported products are displayed
6. ✅ Check product details (name, price, category)
7. ✅ Verify image behavior (valid URLs render, invalid/missing URLs fallback)
8. ✅ Test "Add to Cart" functionality

### Test 4: End-to-End Flow

Complete workflow test:

1. **Setup Business Info**
   - Go to `/dashboard/business-info`
   - Enter all business details
   - Upload a logo (optional)
   - Set working hours
   - Click "Publish Website"

2. **Import Products**
   - Go to `/dashboard/pharmacy/setup`
   - Import CSV with 5-10 products
   - Verify products appear in list

3. **View Template**
   - Navigate to your template
   - Check business info displays correctly
   - Go to medications page
   - Verify products are listed

4. **Test Persistence**
   - Close browser completely
   - Reopen and log in
   - Go to business info page
   - ✅ Verify all data is still there
   - Go to pharmacy setup
   - ✅ Verify products are still there

### Test 5: Error Handling

#### Test API Failure Handling

1. Stop the backend server
2. Open `/dashboard/business-info`
3. ✅ Page should load with localStorage data (if any)
4. Try to save changes
5. ✅ Should show error message
6. Restart backend
7. Refresh page
8. ✅ Should load data from API

#### Test Invalid CSV

1. Create invalid CSV (missing required fields):
   ```csv
   name,category
   Product 1,Category 1
   ```
2. Try to import
3. ✅ Should show error message
4. ✅ No products should be created

### Test 6: Multi-User Isolation

#### Setup

1. Create two user accounts:
   - User A: `usera@test.com`
   - User B: `userb@test.com`

#### Test

1. Log in as User A
2. Add business info and products
3. Log out
4. Log in as User B
5. Add different business info and products
6. ✅ Verify User B doesn't see User A's data
7. Log out and log back in as User A
8. ✅ Verify User A's data is intact

### Expected Results Summary

| Test | Expected Result | Status |
|------|----------------|--------|
| Business info saves | Data persists after refresh | ✅ |
| Business info loads | Data loads from API on mount | ✅ |
| CSV import works | Products appear in list | ✅ |
| Products in template | Products visible in template | ✅ |
| API failure handling | Graceful fallback to localStorage | ✅ |
| Multi-user isolation | Users see only their own data | ✅ |

### Debugging Tips

#### Check Access Token

```javascript
// In browser console
console.log(localStorage.getItem('access_token'))
```

#### Check API Response

```javascript
// In browser console
fetch('http://localhost:8000/api/business-info/', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
})
.then(r => r.json())
.then(data => console.log(data))
```

#### Check Database State

```bash
cd graduation/backend
python manage.py shell
```

```python
from core.models import BusinessInfo, WebsiteSetup
from pharmacies.models import Product

# Check counts
print(f"WebsiteSetups: {WebsiteSetup.objects.count()}")
print(f"BusinessInfo: {BusinessInfo.objects.count()}")
print(f"Products: {Product.objects.count()}")

# Check specific user's data
from core.models import User
user = User.objects.get(email='your@email.com')
ws = WebsiteSetup.objects.get(user=user)
print(f"Business Info: {BusinessInfo.objects.filter(website_setup=ws).exists()}")
print(f"Products: {Product.objects.filter(website_setup=ws).count()}")
```

### Performance Test

Test with large CSV file:

1. Create CSV with 100+ products
2. Import via dashboard
3. ✅ Should complete within 5 seconds
4. ✅ All products should be saved
5. ✅ Products page should load with pagination

### Browser Compatibility

Test in multiple browsers:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (if available)

### Mobile Responsiveness

Test on mobile devices or browser dev tools:
1. Open business info page
2. ✅ Form should be responsive
3. ✅ All fields should be accessible
4. ✅ Save button should work

## Automated Testing (Optional)

If you want to set up automated tests:

```python
# graduation/backend/core/tests/test_business_info.py
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import User, BusinessInfo

class BusinessInfoTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@test.com',
            password='testpass123',
            name='Test User',
            business_type='pharmacy'
        )
        self.client.force_authenticate(user=self.user)
    
    def test_business_info_persistence(self):
        # Create business info
        data = {
            'name': 'Test Pharmacy',
            'about': 'Test about',
            'contact_phone': '555-1234'
        }
        response = self.client.patch('/api/business-info/', data)
        self.assertEqual(response.status_code, 200)
        
        # Verify persistence
        response = self.client.get('/api/business-info/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Test Pharmacy')
```

Run tests:
```bash
cd graduation/backend
python manage.py test core.tests.test_business_info
```
