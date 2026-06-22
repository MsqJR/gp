from django.urls import path, include
from rest_framework.routers import DefaultRouter
from pharmacies.views import PharmacyOrderViewSet, PharmacyViewSet, ProductViewSet
from pharmacies.payment_views import (
    fawry_create_code,
    fawry_webhook,
    stripe_create_intent,
    stripe_webhook,
)

router = DefaultRouter()
router.register(r'pharmacies', PharmacyViewSet, basename='pharmacy')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'orders', PharmacyOrderViewSet, basename='pharmacy-order')

urlpatterns = [
    path('', include(router.urls)),
    path('payments/stripe/create-intent/', stripe_create_intent, name='stripe_create_intent'),
    path('payments/stripe/webhook/', stripe_webhook, name='stripe_webhook'),
    path('payments/fawry/create-code/', fawry_create_code, name='fawry_create_code'),
    path('payments/fawry/webhook/', fawry_webhook, name='fawry_webhook'),
]
