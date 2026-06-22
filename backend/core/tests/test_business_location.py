from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User, WebsiteSetup, BusinessInfo


class BusinessLocationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='loc-user',
            email='loc@example.com',
            password='pass123',
            name='Location User',
            business_type='pharmacy',
        )
        self.website_setup = WebsiteSetup.objects.create(user=self.user, subdomain='loc-user')
        self.business_info = BusinessInfo.objects.create(
            website_setup=self.website_setup,
            name='Location Shop',
            latitude=None,
            longitude=None,
            address='',
        )
        self._authenticate()

    def _authenticate(self):
        access = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_get_business_info_returns_coordinates(self):
        response = self.client.get('/api/business-info/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('latitude', response.data)
        self.assertIn('longitude', response.data)
        self.assertIn('address', response.data)

    def test_update_coordinates_via_put(self):
        response = self.client.put('/api/business-info/', {
            'latitude': 30.0444,
            'longitude': 31.2357,
            'address': 'Tahrir Square, Cairo',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.business_info.refresh_from_db()
        self.assertEqual(self.business_info.latitude, 30.0444)
        self.assertEqual(self.business_info.longitude, 31.2357)
        self.assertEqual(self.business_info.address, 'Tahrir Square, Cairo')

    def test_update_coordinates_via_patch(self):
        response = self.client.patch('/api/business-info/', {
            'latitude': 30.0444,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.business_info.refresh_from_db()
        self.assertEqual(self.business_info.latitude, 30.0444)

    def test_update_coordinates_with_none_values(self):
        self.business_info.latitude = 30.0444
        self.business_info.longitude = 31.2357
        self.business_info.save()

        response = self.client.put('/api/business-info/', {
            'latitude': None,
            'longitude': None,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.business_info.refresh_from_db()
        self.assertIsNone(self.business_info.latitude)
        self.assertIsNone(self.business_info.longitude)

    def test_update_coordinates_requires_authentication(self):
        self.client.credentials()
        response = self.client.put('/api/business-info/', {
            'latitude': 30.0444,
            'longitude': 31.2357,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
