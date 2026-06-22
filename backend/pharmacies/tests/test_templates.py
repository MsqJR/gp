from rest_framework import status
from rest_framework.test import APITestCase

from core.models import User, WebsiteSetup
from pharmacies.models import PharmacyTemplatePurchase


class PharmacyTemplatePurchaseApiTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username='pharmacy-owner-2',
			email='owner2@example.com',
			password='password123',
			name='Pharmacy Owner',
			business_type='pharmacy',
		)
		self.client.force_authenticate(self.user)
		self.purchase_endpoint = '/api/pharmacy/pharmacies/purchase_template/'
		self.cancel_endpoint = '/api/pharmacy/pharmacies/cancel_template_purchase/'
		self.list_endpoint = '/api/pharmacy/pharmacies/template_purchases/'
		self.profile_endpoint = '/api/pharmacy/pharmacies/profile/'

	def test_purchase_template_is_persistent_and_unique_per_template(self):
		payload = {
			'template_id': 4,
			'payment_method': 'visa',
			'transaction_reference': 'tx-1234',
		}
		first_response = self.client.post(self.purchase_endpoint, payload, format='json')
		self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

		second_response = self.client.post(
			self.purchase_endpoint,
			{**payload, 'payment_method': 'fawry', 'transaction_reference': 'tx-5678'},
			format='json',
		)
		self.assertEqual(second_response.status_code, status.HTTP_200_OK)

		self.assertEqual(PharmacyTemplatePurchase.objects.filter(template_id=4).count(), 1)
		purchase = PharmacyTemplatePurchase.objects.get(template_id=4)
		self.assertEqual(purchase.status, PharmacyTemplatePurchase.Status.ACTIVE)
		self.assertEqual(purchase.payment_method, PharmacyTemplatePurchase.PaymentMethod.FAWRY)

		website_setup = WebsiteSetup.objects.get(user=self.user)
		self.assertEqual(website_setup.template_id, 4)
		self.assertTrue(website_setup.is_paid)

	def test_profile_template_activation_requires_active_purchase(self):
		response = self.client.patch(self.profile_endpoint, {'template_id': 5}, format='json')
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('purchase this template', response.data['detail'])

	def test_cancel_purchase_marks_record_and_clears_template_when_last_active(self):
		buy_response = self.client.post(
			self.purchase_endpoint,
			{
				'template_id': 6,
				'payment_method': 'visa',
				'transaction_reference': 'tx-cancel',
			},
			format='json',
		)
		self.assertIn(buy_response.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

		cancel_response = self.client.post(
			self.cancel_endpoint,
			{'template_id': 6},
			format='json',
		)
		self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

		purchase = PharmacyTemplatePurchase.objects.get(template_id=6)
		self.assertEqual(purchase.status, PharmacyTemplatePurchase.Status.CANCELLED)
		self.assertIsNotNone(purchase.cancelled_at)

		profile_response = self.client.get(self.profile_endpoint)
		self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
		self.assertIsNone(profile_response.data['template_id'])

	def test_template_purchase_list_returns_records(self):
		self.client.post(
			self.purchase_endpoint,
			{'template_id': 4, 'payment_method': 'visa', 'transaction_reference': 'tx-list-a'},
			format='json',
		)
		self.client.post(
			self.purchase_endpoint,
			{'template_id': 5, 'payment_method': 'fawry', 'transaction_reference': 'tx-list-b'},
			format='json',
		)

		response = self.client.get(self.list_endpoint)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 2)
		template_ids = {row['template_id'] for row in response.data}
		self.assertEqual(template_ids, {4, 5})
