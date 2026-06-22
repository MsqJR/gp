import hashlib
import json
from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import User, WebsiteSetup, PaymentTransaction


class StripePaymentTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='stripe-user',
            email='stripe@example.com',
            password='pass123',
            name='Stripe User',
            business_type='pharmacy',
        )
        self.website_setup = WebsiteSetup.objects.create(user=self.user, subdomain='stripe-test')
        self.create_intent_url = '/api/pharmacy/payments/stripe/create-intent/'
        self.webhook_url = '/api/pharmacy/payments/stripe/webhook/'
        self.client.force_authenticate(self.user)

    @patch('stripe.PaymentIntent.create')
    def test_create_stripe_intent_success(self, mock_create):
        mock_create.return_value = type('obj', (object,), {
            'client_secret': 'pi_secret_test123',
            'id': 'pi_test123',
        })
        response = self.client.post(self.create_intent_url, {
            'website_setup_id': str(self.website_setup.id),
            'amount': 299.00,
            'currency': 'egp',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('client_secret', response.data)
        self.assertIn('transaction_id', response.data)
        self.assertEqual(response.data['client_secret'], 'pi_secret_test123')

    def test_create_stripe_intent_missing_fields(self):
        response = self.client.post(self.create_intent_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_stripe_intent_requires_auth(self):
        self.client.force_authenticate(None)
        response = self.client.post(self.create_intent_url, {
            'website_setup_id': str(self.website_setup.id),
            'amount': 299.00,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('stripe.Webhook.construct_event')
    def test_stripe_webhook_valid_signature(self, mock_construct):
        mock_construct.return_value = {
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_success_123',
                    'amount': 29900,
                    'currency': 'egp',
                    'status': 'succeeded',
                }
            },
        }
        PaymentTransaction.objects.create(
            website_setup=self.website_setup,
            amount=299.00,
            currency='EGP',
            provider=PaymentTransaction.Provider.STRIPE,
            status=PaymentTransaction.Status.PENDING,
            transaction_id='pi_success_123',
        )
        response = self.client.post(
            self.webhook_url,
            json.dumps({'type': 'payment_intent.succeeded'}),
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='valid_sig',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.get(transaction_id='pi_success_123')
        self.assertEqual(txn.status, PaymentTransaction.Status.SUCCESS)

    @patch('stripe.Webhook.construct_event')
    def test_stripe_webhook_invalid_signature(self, mock_construct):
        from stripe import SignatureVerificationError
        mock_construct.side_effect = SignatureVerificationError('Invalid signature', 'bad_sig')
        response = self.client.post(
            self.webhook_url,
            json.dumps({'type': 'payment_intent.succeeded'}),
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='bad_sig',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('stripe.Webhook.construct_event')
    def test_stripe_webhook_updates_transaction_to_refunded(self, mock_construct):
        mock_construct.return_value = {
            'type': 'charge.refunded',
            'data': {
                'object': {
                    'id': 'ch_refund_123',
                    'payment_intent': 'pi_refund_123',
                }
            },
        }
        PaymentTransaction.objects.create(
            website_setup=self.website_setup,
            amount=299.00,
            currency='EGP',
            provider=PaymentTransaction.Provider.STRIPE,
            status=PaymentTransaction.Status.SUCCESS,
            transaction_id='pi_refund_123',
        )
        response = self.client.post(
            self.webhook_url,
            json.dumps({'type': 'charge.refunded'}),
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='valid_sig_refund',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.get(transaction_id='pi_refund_123')
        self.assertEqual(txn.status, PaymentTransaction.Status.REFUNDED)


class FawryPaymentTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='fawry-user',
            email='fawry@example.com',
            password='pass123',
            name='Fawry User',
            business_type='pharmacy',
        )
        self.website_setup = WebsiteSetup.objects.create(user=self.user, subdomain='fawry-test')
        self.create_code_url = '/api/pharmacy/payments/fawry/create-code/'
        self.webhook_url = '/api/pharmacy/payments/fawry/webhook/'
        self.client.force_authenticate(self.user)

    @patch('requests.post')
    @override_settings(
        FAWRY_MERCHANT_CODE='mock_fawry_code',
        FAWRY_SECURE_KEY='mock_fawry_key',
    )
    def test_create_fawry_code_success(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            'referenceCode': '9812739481',
            'expirationTime': 1782297600000,
        }
        response = self.client.post(self.create_code_url, {
            'website_setup_id': str(self.website_setup.id),
            'amount': 150.00,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('reference_code', response.data)
        self.assertEqual(response.data['reference_code'], '9812739481')

    def test_create_fawry_code_missing_fields(self):
        response = self.client.post(self.create_code_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(
        FAWRY_MERCHANT_CODE='mock_fawry_code',
        FAWRY_SECURE_KEY='mock_fawry_key',
    )
    def test_fawry_webhook_valid_signature(self):
        merchant_code = 'mock_fawry_code'
        merchant_ref = 'txn_ref_001'
        fawry_ref = '9812739481'
        order_status = 'PAID'
        amount = '150.00'
        secure_key = 'mock_fawry_key'
        raw = merchant_code + merchant_ref + fawry_ref + order_status + amount + secure_key
        signature = hashlib.sha256(raw.encode('utf-8')).hexdigest()

        PaymentTransaction.objects.create(
            website_setup=self.website_setup,
            amount=150.00,
            currency='EGP',
            provider=PaymentTransaction.Provider.FAWRY,
            status=PaymentTransaction.Status.PENDING,
            transaction_id=merchant_ref,
        )

        response = self.client.post(self.webhook_url, {
            'requestId': '123456789',
            'fawryRefNumber': fawry_ref,
            'merchantRefNumber': merchant_ref,
            'orderStatus': order_status,
            'amount': 150.00,
            'signature': signature,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.get(transaction_id=merchant_ref)
        self.assertEqual(txn.status, PaymentTransaction.Status.SUCCESS)

    @override_settings(
        FAWRY_MERCHANT_CODE='mock_fawry_code',
        FAWRY_SECURE_KEY='mock_fawry_key',
    )
    def test_fawry_webhook_invalid_signature(self):
        response = self.client.post(self.webhook_url, {
            'requestId': '123456789',
            'fawryRefNumber': '9812739481',
            'merchantRefNumber': 'txn_ref_001',
            'orderStatus': 'PAID',
            'amount': 150.00,
            'signature': 'invalid_signature_hash',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
