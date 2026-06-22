import re

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User, WebsiteSetup


class AuthenticationFeatureTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username='auth-user',
			email='auth@example.com',
			password='CurrentPass123!',
			name='Auth User',
			business_type='pharmacy',
		)
		self.website_setup = WebsiteSetup.objects.create(user=self.user, subdomain='auth-user')

	def _authenticate(self):
		access = RefreshToken.for_user(self.user).access_token
		self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

	def _create_password_reset_pair(self):
		uid = urlsafe_base64_encode(force_bytes(self.user.pk))
		token = default_token_generator.make_token(self.user)
		return uid, token

	def test_logout_blacklists_provided_refresh_token(self):
		self._authenticate()
		refresh = RefreshToken.for_user(self.user)
		jti = str(refresh['jti'])

		response = self.client.post('/api/auth/logout/', {'refresh': str(refresh)}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		outstanding = OutstandingToken.objects.get(jti=jti)
		self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

	def test_logout_requires_refresh_token_when_not_all_devices(self):
		self._authenticate()

		response = self.client.post('/api/auth/logout/', {}, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('refresh', response.data)

	def test_logout_all_devices_blacklists_all_outstanding_tokens(self):
		self._authenticate()
		RefreshToken.for_user(self.user)
		RefreshToken.for_user(self.user)

		response = self.client.post('/api/auth/logout/', {'all_devices': True}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		outstanding_tokens = OutstandingToken.objects.filter(user=self.user)
		blacklisted_count = BlacklistedToken.objects.filter(token__in=outstanding_tokens).count()
		self.assertEqual(blacklisted_count, outstanding_tokens.count())

	def test_delete_account_validates_password_and_confirmation(self):
		self._authenticate()

		response = self.client.post(
			'/api/auth/delete-account/',
			{
				'email': self.user.email,
				'password': 'wrong-password',
				'confirmation_text': 'DELETE',
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

	def test_delete_account_removes_user_and_related_records(self):
		self._authenticate()
		RefreshToken.for_user(self.user)
		RefreshToken.for_user(self.user)
		outstanding_jtis = list(OutstandingToken.objects.filter(user=self.user).values_list('jti', flat=True))

		response = self.client.post(
			'/api/auth/delete-account/',
			{
				'email': self.user.email,
				'password': 'CurrentPass123!',
				'confirmation_text': 'DELETE',
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
		self.assertFalse(WebsiteSetup.objects.filter(pk=self.website_setup.pk).exists())
		for jti in outstanding_jtis:
			outstanding = OutstandingToken.objects.get(jti=jti)
			self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

	@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
	def test_forgot_password_returns_generic_response_and_sends_email_for_existing_user(self):
		response = self.client.post('/api/auth/forgot-password/', {'email': self.user.email}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn('If an account exists for this email', response.data['message'])
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn(self.user.email, mail.outbox[0].to)

		match = re.search(r'uid=([^&\s]+)&token=([^\s]+)', mail.outbox[0].body)
		self.assertIsNotNone(match)

	@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
	def test_forgot_password_does_not_expose_unknown_email(self):
		response = self.client.post('/api/auth/forgot-password/', {'email': 'missing@example.com'}, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(mail.outbox), 0)

	def test_validate_reset_token_endpoint(self):
		uid, token = self._create_password_reset_pair()

		valid_response = self.client.post(
			'/api/auth/password-reset/validate/',
			{'uid': uid, 'token': token},
			format='json',
		)
		invalid_response = self.client.post(
			'/api/auth/password-reset/validate/',
			{'uid': uid, 'token': 'invalid-token'},
			format='json',
		)

		self.assertEqual(valid_response.status_code, status.HTTP_200_OK)
		self.assertTrue(valid_response.data['valid'])
		self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(invalid_response.data['valid'])

	def test_reset_password_confirm_updates_password_and_revokes_tokens(self):
		refresh = RefreshToken.for_user(self.user)
		refresh_jti = str(refresh['jti'])
		uid, token = self._create_password_reset_pair()

		response = self.client.post(
			'/api/auth/password-reset/confirm/',
			{
				'uid': uid,
				'token': token,
				'password': 'UpdatedPass456!',
				'password_confirm': 'UpdatedPass456!',
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.user.refresh_from_db()
		self.assertTrue(self.user.check_password('UpdatedPass456!'))
		self.assertFalse(self.user.check_password('CurrentPass123!'))

		outstanding = OutstandingToken.objects.get(jti=refresh_jti)
		self.assertTrue(BlacklistedToken.objects.filter(token=outstanding).exists())

		login_response = self.client.post(
			'/api/auth/login/',
			{'email': self.user.email, 'password': 'UpdatedPass456!'},
			format='json',
		)
		self.assertEqual(login_response.status_code, status.HTTP_200_OK)
