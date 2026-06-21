from unittest.mock import patch
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from core.models import User


MOCK_GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com'


def _mock_valid_google_token(email='googleuser@gmail.com', name='Google User', sub='12345'):
    return {
        'email': email,
        'name': name,
        'sub': sub,
    }


@override_settings(GOOGLE_OAUTH2_CLIENT_ID=MOCK_GOOGLE_CLIENT_ID)
class GoogleLoginViewTests(APITestCase):
    def setUp(self):
        self.url = '/api/auth/google/'
        self.existing_user = User.objects.create_user(
            username='existing@example.com',
            email='existing@example.com',
            password='pass123',
            name='Existing User',
            business_type='pharmacy',
        )

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_login_creates_new_user(self, mock_verify):
        mock_verify.return_value = _mock_valid_google_token(
            email='new@google.com',
            name='New User',
            sub='new-sub-123',
        )
        response = self.client.post(self.url, {'id_token': 'mock-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['email'], 'new@google.com')
        self.assertEqual(response.data['user']['is_onboarding_completed'], False)
        self.assertTrue(User.objects.filter(email='new@google.com').exists())

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_login_links_existing_user(self, mock_verify):
        mock_verify.return_value = _mock_valid_google_token(
            email='existing@example.com',
            name='Existing User',
            sub='existing-sub',
        )
        response = self.client.post(self.url, {'id_token': 'mock-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['email'], 'existing@example.com')
        self.existing_user.refresh_from_db()
        self.assertEqual(self.existing_user.google_oauth_id, 'existing-sub')

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_login_invalid_token_returns_error(self, mock_verify):
        from google.auth.exceptions import GoogleAuthError
        mock_verify.side_effect = GoogleAuthError('Invalid token')
        response = self.client.post(self.url, {'id_token': 'bad-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_google_login_missing_id_token(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_login_returns_jwt_tokens(self, mock_verify):
        mock_verify.return_value = _mock_valid_google_token(
            email='jwttest@google.com',
            name='JWT Test',
            sub='jwt-sub',
        )
        response = self.client.post(self.url, {'id_token': 'mock-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertTrue(len(response.data['access']) > 0)
        self.assertTrue(len(response.data['refresh']) > 0)
