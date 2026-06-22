import hashlib
import logging

import stripe
from django.conf import settings
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.models import PaymentTransaction, WebsiteSetup


logger = logging.getLogger(__name__)


class StripeCreateIntentSerializer(serializers.Serializer):
    website_setup_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField(default='egp')


class FawryCreateCodeSerializer(serializers.Serializer):
    website_setup_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def stripe_create_intent(request):
    serializer = StripeCreateIntentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    website_setup_id = serializer.validated_data['website_setup_id']
    amount = float(serializer.validated_data['amount'])
    currency = serializer.validated_data.get('currency', 'egp')

    try:
        website_setup = WebsiteSetup.objects.get(id=website_setup_id)
    except WebsiteSetup.DoesNotExist:
        return Response({'error': 'Website setup not found.'}, status=status.HTTP_404_NOT_FOUND)

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        intent = stripe.PaymentIntent.create(
            amount=int(amount * 100),
            currency=currency.lower(),
            metadata={'website_setup_id': str(website_setup.id)},
        )
    except stripe.error.StripeError as e:
        logger.exception('Stripe create intent failed')
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    PaymentTransaction.objects.create(
        website_setup=website_setup,
        amount=amount,
        currency=currency.upper(),
        provider=PaymentTransaction.Provider.STRIPE,
        status=PaymentTransaction.Status.PENDING,
        transaction_id=intent.id,
    )

    return Response({
        'client_secret': intent.client_secret,
        'transaction_id': intent.id,
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning('Stripe webhook signature verification failed: %s', e)
        return Response({'error': 'Invalid signature'}, status=status.HTTP_400_BAD_REQUEST)

    event_type = event.get('type', '')
    data_object = event.get('data', {}).get('object', {})

    if event_type == 'payment_intent.succeeded':
        payment_intent_id = data_object.get('id')
        with transaction.atomic():
            updated = PaymentTransaction.objects.filter(
                transaction_id=payment_intent_id,
                provider=PaymentTransaction.Provider.STRIPE,
            ).exclude(status=PaymentTransaction.Status.SUCCESS).update(
                status=PaymentTransaction.Status.SUCCESS,
            )
            if updated:
                logger.info('Stripe payment succeeded: %s', payment_intent_id)

    elif event_type == 'charge.refunded':
        payment_intent_id = data_object.get('payment_intent')
        if payment_intent_id:
            with transaction.atomic():
                updated = PaymentTransaction.objects.filter(
                    transaction_id=payment_intent_id,
                    provider=PaymentTransaction.Provider.STRIPE,
                    status=PaymentTransaction.Status.SUCCESS,
                ).update(status=PaymentTransaction.Status.REFUNDED)
                if updated:
                    logger.info('Stripe payment refunded: %s', payment_intent_id)

    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def fawry_create_code(request):
    serializer = FawryCreateCodeSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    website_setup_id = serializer.validated_data['website_setup_id']
    amount = float(serializer.validated_data['amount'])

    try:
        website_setup = WebsiteSetup.objects.get(id=website_setup_id)
    except WebsiteSetup.DoesNotExist:
        return Response({'error': 'Website setup not found.'}, status=status.HTTP_404_NOT_FOUND)

    merchant_code = settings.FAWRY_MERCHANT_CODE
    merchant_ref = f"txn_{website_setup.id}_{PaymentTransaction.objects.count() + 1}"

    import requests as http_requests

    fawry_payload = {
        'merchantCode': merchant_code,
        'merchantRefNumber': merchant_ref,
        'customerMobile': '',
        'customerEmail': request.user.email,
        'amount': amount,
    }

    try:
        fawry_response = http_requests.post(
            settings.FAWRY_API_URL,
            json=fawry_payload,
            timeout=30,
        )
        fawry_response.raise_for_status()
        result = fawry_response.json()
    except Exception as e:
        logger.exception('Fawry API call failed')
        return Response({'error': f'Fawry API error: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    reference_code = result.get('referenceCode', '')
    expire_at = result.get('expirationTime', 0)

    PaymentTransaction.objects.create(
        website_setup=website_setup,
        amount=amount,
        currency='EGP',
        provider=PaymentTransaction.Provider.FAWRY,
        status=PaymentTransaction.Status.PENDING,
        transaction_id=merchant_ref,
    )

    return Response({
        'reference_code': reference_code,
        'expire_at': expire_at,
        'payment_instructions': f'Pay at any Fawry kiosk using code {reference_code} before expiry.',
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def fawry_webhook(request):
    data = request.data

    merchant_code = settings.FAWRY_MERCHANT_CODE
    secure_key = settings.FAWRY_SECURE_KEY

    merchant_ref = data.get('merchantRefNumber', '')
    fawry_ref = data.get('fawryRefNumber', '')
    order_status = data.get('orderStatus', '')
    amount_raw = data.get('amount', '')
    amount = f"{float(amount_raw):.2f}" if amount_raw else ''
    received_signature = data.get('signature', '')

    raw = merchant_code + merchant_ref + fawry_ref + order_status + amount + secure_key
    expected_signature = hashlib.sha256(raw.encode('utf-8')).hexdigest()

    from django.utils.crypto import constant_time_compare
    if not constant_time_compare(received_signature, expected_signature):
        logger.warning('Fawry webhook signature mismatch for ref: %s', merchant_ref)
        return Response({'error': 'Invalid signature'}, status=status.HTTP_400_BAD_REQUEST)

    new_status = PaymentTransaction.Status.SUCCESS if order_status == 'PAID' else PaymentTransaction.Status.FAILED

    with transaction.atomic():
        updated = PaymentTransaction.objects.filter(
            transaction_id=merchant_ref,
            provider=PaymentTransaction.Provider.FAWRY,
        ).exclude(status=new_status).update(status=new_status)
        if updated:
            logger.info('Fawry webhook processed: %s -> %s', merchant_ref, order_status)

    return Response({'status': 'ok'})
