from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import User
from pharmacies.models import Product


class ProductBulkUploadCsvTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username='pharmacy-owner',
			email='owner@example.com',
			password='password123',
			name='Pharmacy Owner',
			business_type='pharmacy',
		)
		self.client.force_authenticate(self.user)
		self.endpoint = '/api/pharmacy/products/bulk_upload/'

	def _upload_csv(self, csv_content: str):
		upload = SimpleUploadedFile(
			'products.csv',
			csv_content.encode('utf-8'),
			content_type='text/csv',
		)
		return self.client.post(self.endpoint, {'file': upload}, format='multipart')

	def test_alias_headers_are_parsed_and_stock_is_saved(self):
		csv_content = (
			'Product Name,Category,Price,Stock Quantity,Description\n'
			'Vitamin C 1000mg,Vitamins,19.99,25,Daily immune support\n'
			'Ibuprofen 200mg,Pain Relief,9.50,10,Fast pain relief\n'
		)

		response = self._upload_csv(csv_content)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data['success_count'], 2)
		self.assertEqual(response.data['created_count'], 2)
		self.assertEqual(response.data['updated_count'], 0)
		self.assertEqual(response.data['failed_count'], 0)

		products = Product.objects.order_by('name')
		self.assertEqual(products.count(), 2)
		self.assertEqual(products[0].stock, 10)
		self.assertEqual(products[1].stock, 25)

	def test_invalid_rows_are_skipped_and_valid_rows_continue(self):
		csv_content = (
			'Product Name,Category,Price,Stock Quantity,Description\n'
			'Valid Product A,Supplements,12.50,12,Valid row\n'
			'Invalid Stock Row,Supplements,8.20,abc,Invalid stock\n'
			'Invalid Price Row,Supplements,not-a-price,8,Invalid price\n'
			'Valid Product B,Supplements,5.75,7.0,Whole-number decimal stock\n'
		)

		response = self._upload_csv(csv_content)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['success_count'], 2)
		self.assertEqual(response.data['created_count'], 2)
		self.assertEqual(response.data['updated_count'], 0)
		self.assertEqual(response.data['failed_count'], 2)
		self.assertEqual(len(response.data['failed_rows']), 2)

		self.assertEqual(Product.objects.count(), 2)
		stocks = sorted(Product.objects.values_list('stock', flat=True))
		self.assertEqual(stocks, [7, 12])

		failed_row_numbers = {entry['row'] for entry in response.data['failed_rows']}
		self.assertEqual(failed_row_numbers, {3, 4})

	def test_semicolon_delimiter_and_thousand_values_are_supported(self):
		csv_content = (
			'Product Name;Category;Price;Stock Quantity;Description\n'
			'Blood Pressure Monitor;Devices;$1,299.50;1,000;Home monitoring device\n'
			'Thermometer;Devices;12.00;7,0;Decimal stock format\n'
		)

		response = self._upload_csv(csv_content)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data['success_count'], 2)
		self.assertEqual(response.data['failed_count'], 0)

		product = Product.objects.get(name='Blood Pressure Monitor')
		self.assertEqual(str(product.price), '1299.50')
		self.assertEqual(product.stock, 1000)
		self.assertEqual(Product.objects.get(name='Thermometer').stock, 7)

	def test_invalid_image_url_is_ignored_without_failing_row(self):
		csv_content = (
			'Product Name,Category,Price,Stock Quantity,Description,Image\n'
			'Vitamin C 1000mg,Vitamins,19.99,25,Daily immune support,not-a-url\n'
			'Ibuprofen 200mg,Pain Relief,9.50,10,Fast pain relief,https://example.com/product.jpg\n'
		)

		response = self._upload_csv(csv_content)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(response.data['success_count'], 2)
		self.assertEqual(response.data['failed_count'], 0)

		invalid_url_product = Product.objects.get(name='Vitamin C 1000mg')
		valid_url_product = Product.objects.get(name='Ibuprofen 200mg')
		self.assertEqual(invalid_url_product.image_url, '')
		self.assertEqual(valid_url_product.image_url, 'https://example.com/product.jpg')

	def test_missing_required_columns_returns_clear_feedback(self):
		csv_content = (
			'Product Name,Category,Price,Description\n'
			'Vitamin C 1000mg,Vitamins,19.99,Daily immune support\n'
		)

		response = self._upload_csv(csv_content)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data['success_count'], 0)
		self.assertEqual(response.data['failed_count'], 1)
		self.assertEqual(response.data['processed_count'], 1)
		self.assertEqual(Product.objects.count(), 0)
		self.assertIn('Missing required columns', response.data['failed_rows'][0]['errors'][0])

	def test_json_bulk_upload_skips_invalid_rows(self):
		payload = {
			'products': [
				{
					'name': 'Valid JSON Product',
					'category': 'Supplements',
					'price': 10.5,
					'stock': 5,
					'description': 'Valid row',
				},
				{
					'name': 'Invalid JSON Product',
					'category': 'Supplements',
					'price': 4.2,
					'stock': 'not-an-integer',
					'description': 'Invalid stock',
				},
				{
					'name': 'Second Valid JSON Product',
					'category': 'Supplements',
					'price': 8.0,
					'stock': 2,
					'description': 'Valid row',
				},
			]
		}

		response = self.client.post(self.endpoint, payload, format='json')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['success_count'], 2)
		self.assertEqual(response.data['failed_count'], 1)
		self.assertEqual(len(response.data['failed_rows']), 1)
		self.assertEqual(Product.objects.count(), 2)

	def test_delete_all_products_works(self):
		seed_csv = (
			'Product Name,Category,Price,Stock Quantity,Description\n'
			'Delete A,General,5.00,3,Seed product\n'
			'Delete B,General,7.00,5,Seed product\n'
		)
		seed_response = self._upload_csv(seed_csv)
		self.assertEqual(seed_response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(Product.objects.count(), 2)

		response = self.client.delete('/api/pharmacy/products/delete_all/')

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn('products deleted successfully', response.data['message'])
		self.assertEqual(Product.objects.count(), 0)
