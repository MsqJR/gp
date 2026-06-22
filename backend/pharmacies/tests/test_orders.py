from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import User, WebsiteSetup
from pharmacies.models import Pharmacy, PharmacyOrder, Product


class PharmacyOrderApiTests(APITestCase):
	def setUp(self):
		self.owner = User.objects.create_user(
			username='pharmacy-owner-orders',
			email='orders-owner@example.com',
			password='password123',
			name='Order Owner',
			business_type='pharmacy',
		)

		self.website_setup = WebsiteSetup.objects.create(user=self.owner, subdomain='orders-owner')
		self.pharmacy = Pharmacy.objects.create(
			user=self.owner,
			website_setup=self.website_setup,
			name='Order Owner Pharmacy',
			template_id=1,
		)

		self.product_a = Product.objects.create(
			pharmacy=self.pharmacy,
			website_setup=self.website_setup,
			name='Order Test A',
			category='General',
			description='A',
			price=Decimal('10.00'),
			stock=20,
		)
		self.product_b = Product.objects.create(
			pharmacy=self.pharmacy,
			website_setup=self.website_setup,
			name='Order Test B',
			category='General',
			description='B',
			price=Decimal('15.00'),
			stock=10,
		)

		self.place_endpoint = '/api/pharmacy/orders/place/'
		self.list_endpoint = '/api/pharmacy/orders/'

	def _build_payload(self, request_id='req-001', payment_method='card'):
		payload = {
			'owner_id': str(self.owner.id),
			'client_request_id': request_id,
			'full_name': 'Jane Patient',
			'email': 'jane@example.com',
			'phone': '+1555123456',
			'address': '123 Main St',
			'city': 'Cairo',
			'state': 'Cairo Governorate',
			'zip_code': '12345',
			'delivery_method': 'delivery',
			'payment_method': payment_method,
			'delivery_fee': '5.00',
			'items': [
				{'product_id': str(self.product_a.id), 'quantity': 2},
				{'product_id': str(self.product_b.id), 'quantity': 1},
			],
		}
		if payment_method == 'card':
			payload['payment_last4'] = '1234'
		return payload

	def test_place_order_creates_pending_order_and_reduces_stock(self):
		response = self.client.post(self.place_endpoint, self._build_payload(), format='json')

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertFalse(response.data['duplicate'])
		self.assertEqual(response.data['order']['status'], 'pending')
		self.assertEqual(response.data['order']['payment_status'], 'paid')

		order = PharmacyOrder.objects.get(order_number=response.data['order']['order_number'])
		self.assertEqual(order.items.count(), 2)
		self.assertEqual(str(order.subtotal), '35.00')
		self.assertEqual(str(order.delivery_fee), '5.00')
		self.assertEqual(str(order.total), '40.00')

		self.product_a.refresh_from_db()
		self.product_b.refresh_from_db()
		self.assertEqual(self.product_a.stock, 18)
		self.assertEqual(self.product_b.stock, 9)

	def test_unseen_count_ignores_unpaid_cash_orders_until_completed(self):
		response = self.client.post(
			self.place_endpoint,
			self._build_payload(request_id='cash-unseen-1', payment_method='cash'),
			format='json',
		)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data['order']['payment_status'], 'pending')

		self.client.force_authenticate(self.owner)

		initial_unseen_response = self.client.get('/api/pharmacy/orders/unseen_count/')
		self.assertEqual(initial_unseen_response.status_code, status.HTTP_200_OK)
		self.assertEqual(initial_unseen_response.data['count'], 0)

		order_id = response.data['order']['id']
		complete_response = self.client.patch(
			f'/api/pharmacy/orders/{order_id}/status/',
			{'status': 'completed'},
			format='json',
		)
		self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
		self.assertEqual(complete_response.data['payment_status'], 'paid')

		unseen_after_completed_response = self.client.get('/api/pharmacy/orders/unseen_count/')
		self.assertEqual(unseen_after_completed_response.status_code, status.HTTP_200_OK)
		self.assertEqual(unseen_after_completed_response.data['count'], 1)

	def test_place_order_requires_delivery_fields(self):
		payload = self._build_payload()
		payload['address'] = ''
		payload['city'] = ''

		response = self.client.post(self.place_endpoint, payload, format='json')

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(PharmacyOrder.objects.count(), 0)
		self.assertIn('delivery_details', response.data)

	def test_place_order_is_idempotent_for_same_client_request_id(self):
		payload = self._build_payload(request_id='duplicate-req-1')

		first_response = self.client.post(self.place_endpoint, payload, format='json')
		second_response = self.client.post(self.place_endpoint, payload, format='json')

		self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(second_response.status_code, status.HTTP_200_OK)
		self.assertTrue(second_response.data['duplicate'])
		self.assertEqual(PharmacyOrder.objects.count(), 1)

	def test_owner_can_list_and_update_order_status(self):
		create_response = self.client.post(self.place_endpoint, self._build_payload(), format='json')
		self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

		self.client.force_authenticate(self.owner)

		list_response = self.client.get(self.list_endpoint)
		self.assertEqual(list_response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(list_response.data), 1)

		order_id = list_response.data[0]['id']
		status_response = self.client.patch(
			f'/api/pharmacy/orders/{order_id}/status/',
			{'status': 'processing'},
			format='json',
		)
		self.assertEqual(status_response.status_code, status.HTTP_200_OK)
		self.assertEqual(status_response.data['status'], 'processing')

	def test_unseen_count_resets_after_mark_seen(self):
		create_response = self.client.post(self.place_endpoint, self._build_payload(), format='json')
		self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

		self.client.force_authenticate(self.owner)

		before_response = self.client.get('/api/pharmacy/orders/unseen_count/')
		self.assertEqual(before_response.status_code, status.HTTP_200_OK)
		self.assertEqual(before_response.data['count'], 1)

		mark_seen_response = self.client.post('/api/pharmacy/orders/mark_seen/', {}, format='json')
		self.assertEqual(mark_seen_response.status_code, status.HTTP_200_OK)
		self.assertEqual(mark_seen_response.data['marked_seen'], 1)
		self.assertEqual(mark_seen_response.data['remaining_unseen'], 0)

		after_response = self.client.get('/api/pharmacy/orders/unseen_count/')
		self.assertEqual(after_response.status_code, status.HTTP_200_OK)
		self.assertEqual(after_response.data['count'], 0)

	def test_mark_seen_endpoint_updates_only_requested_orders(self):
		first_response = self.client.post(self.place_endpoint, self._build_payload(request_id='req-100'), format='json')
		second_response = self.client.post(self.place_endpoint, self._build_payload(request_id='req-101'), format='json')
		self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)

		self.client.force_authenticate(self.owner)

		unseen_response = self.client.get('/api/pharmacy/orders/unseen_count/')
		self.assertEqual(unseen_response.status_code, status.HTTP_200_OK)
		self.assertEqual(unseen_response.data['count'], 2)

		first_order_id = first_response.data['order']['id']
		mark_response = self.client.post(
			'/api/pharmacy/orders/mark_seen/',
			{'order_ids': [first_order_id]},
			format='json',
		)
		self.assertEqual(mark_response.status_code, status.HTTP_200_OK)
		self.assertEqual(mark_response.data['marked_seen'], 1)
		self.assertEqual(mark_response.data['remaining_unseen'], 1)
