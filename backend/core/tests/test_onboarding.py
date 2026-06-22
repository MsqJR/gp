from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User, WebsiteSetup


class OnboardingViewTests(APITestCase):
    def setUp(self):
        self.url = '/api/auth/onboarding/'
        self.user = User.objects.create_user(
            username='onboard-user',
            email='onboard@example.com',
            password='pass123',
            name='Onboard User',
            business_type='',
            is_onboarding_completed=False,
        )
        self._authenticate()

    def _authenticate(self):
        access = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_onboarding_completes_successfully(self):
        response = self.client.post(self.url, {
            'business_type': 'pharmacy',
            'subdomain': 'onboard-pharmacy',
            'business_name': 'Onboard Pharmacy',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
        self.user.refresh_from_db()
        self.assertEqual(self.user.business_type, 'pharmacy')
        self.assertTrue(self.user.is_onboarding_completed)
        self.assertTrue(WebsiteSetup.objects.filter(user=self.user, subdomain='onboard-pharmacy').exists())

    def test_onboarding_hospital_business_type(self):
        response = self.client.post(self.url, {
            'business_type': 'hospital',
            'subdomain': 'onboard-hospital',
            'business_name': 'Onboard Hospital',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.business_type, 'hospital')
        self.assertTrue(self.user.is_onboarding_completed)

    def test_onboarding_duplicate_subdomain(self):
        WebsiteSetup.objects.create(user=self.user, subdomain='taken-subdomain')
        another_user = User.objects.create_user(
            username='another',
            email='another@example.com',
            password='pass123',
            name='Another',
            business_type='pharmacy',
        )
        access = RefreshToken.for_user(another_user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        response = self.client.post(self.url, {
            'business_type': 'pharmacy',
            'subdomain': 'taken-subdomain',
            'business_name': 'Another Pharmacy',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_onboarding_missing_required_fields(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_onboarding_requires_authentication(self):
        self.client.credentials()
        response = self.client.post(self.url, {
            'business_type': 'pharmacy',
            'subdomain': 'no-auth',
            'business_name': 'No Auth',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
