from rest_framework import serializers
from decimal import Decimal
import json
from django.core.validators import URLValidator
from pharmacies.models import Pharmacy, PharmacyOrder, PharmacyOrderItem, PharmacyTemplatePurchase, Product


http_image_url_validator = URLValidator(schemes=['http', 'https'])


class PharmacySerializer(serializers.ModelSerializer):
    """Serializer for Pharmacy profile model."""

    logo_url = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    subdomain = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = [
            'id',
            'name',
            'description',
            'logo',
            'logo_url',
            'theme_settings',
            'template_id',
            'is_published',
            'google_sheet_url',
            'google_sheet_sync_enabled',
            'google_sheet_last_synced_at',
            'product_count',
            'subdomain',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'product_count',
            'google_sheet_url',
            'google_sheet_sync_enabled',
            'google_sheet_last_synced_at',
            'created_at',
            'updated_at',
        ]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url

    def get_product_count(self, obj):
        return obj.products.count()

    def get_subdomain(self, obj):
        if hasattr(obj, 'website_setup') and obj.website_setup:
            return obj.website_setup.subdomain
        return None


class PharmacyCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating pharmacy profile."""

    class Meta:
        model = Pharmacy
        fields = [
            'name',
            'description',
            'logo',
            'theme_settings',
            'template_id',
            'is_published',
        ]

    def validate_theme_settings(self, value):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise serializers.ValidationError('theme_settings must be valid JSON.')
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('theme_settings must be a JSON object.')
        return value


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Pharmacy Product model"""
    image_url_resolved = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            'id',
            'pharmacy',
            'name',
            'category',
            'description',
            'image',
            'image_url',
            'image_url_resolved',
            'price',
            'stock',
            'in_stock',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'pharmacy', 'in_stock', 'created_at', 'updated_at']

    def get_image_url_resolved(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return obj.image_url or None


class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating Products"""
    
    class Meta:
        model = Product
        fields = ['name', 'category', 'description', 'image', 'image_url', 'price', 'stock']
    
    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative")
        if value >= Decimal('100000000'):
            raise serializers.ValidationError("Price cannot exceed 99,999,999.99")
        return value
    
    def validate_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Stock cannot be negative")
        if value > 2147483647:
            raise serializers.ValidationError("Stock cannot exceed 2,147,483,647")
        return value

    def validate_category(self, value):
        cleaned = (value or '').strip()
        return cleaned or 'General'

    def validate_image_url(self, value):
        cleaned = (value or '').strip()
        if not cleaned:
            return ''

        http_image_url_validator(cleaned)
        return cleaned


class ProductBulkUploadSerializer(serializers.Serializer):
    """Serializer for JSON-based bulk uploads."""

    products = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )
    
    def validate_products(self, value):
        for idx, product in enumerate(value, start=1):
            if not isinstance(product, dict):
                raise serializers.ValidationError(f"Row {idx}: each row must be a JSON object.")

        return value


class ProductBulkUploadFromSheetSerializer(serializers.Serializer):
    """Serializer for importing products from a public Google Sheet URL."""

    url = serializers.URLField()
    dry_run = serializers.BooleanField(required=False, default=False)
    enable_live_sync = serializers.BooleanField(required=False, default=True)


class ProductConnectGoogleSheetSerializer(serializers.Serializer):
    """Connect a Google Sheet for live product synchronization."""

    url = serializers.URLField()
    webhook_url = serializers.URLField(required=False, allow_blank=True)


class PharmacyOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyOrderItem
        fields = [
            'id',
            'product',
            'product_name',
            'product_category',
            'quantity',
            'unit_price',
            'line_total',
        ]
        read_only_fields = fields


class PharmacyOrderSerializer(serializers.ModelSerializer):
    items = PharmacyOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PharmacyOrder
        fields = [
            'id',
            'order_number',
            'patient_name',
            'patient_email',
            'patient_phone',
            'address',
            'city',
            'state',
            'zip_code',
            'delivery_method',
            'payment_method',
            'payment_status',
            'payment_last4',
            'notes',
            'status',
            'subtotal',
            'delivery_fee',
            'total',
            'status_updated_at',
            'owner_seen_at',
            'created_at',
            'updated_at',
            'items',
        ]
        read_only_fields = fields


class PharmacyOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PharmacyOrder.Status.choices)


class PharmacyOrderCreateItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=1000)


class PharmacyOrderCreateSerializer(serializers.Serializer):
    owner_id = serializers.UUIDField()
    client_request_id = serializers.CharField(required=False, allow_blank=True, max_length=64)

    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=32)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    state = serializers.CharField(required=False, allow_blank=True, max_length=120)
    zip_code = serializers.CharField(required=False, allow_blank=True, max_length=20)

    delivery_method = serializers.ChoiceField(choices=PharmacyOrder.DeliveryMethod.choices)
    payment_method = serializers.ChoiceField(choices=PharmacyOrder.PaymentMethod.choices)
    payment_last4 = serializers.CharField(required=False, allow_blank=True, max_length=4)
    notes = serializers.CharField(required=False, allow_blank=True)
    delivery_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)

    items = PharmacyOrderCreateItemSerializer(many=True, allow_empty=False)

    def validate_full_name(self, value):
        cleaned = (value or '').strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError('Full name must be at least 2 characters.')
        return cleaned

    def validate_phone(self, value):
        cleaned = (value or '').strip()
        if len(cleaned) < 6:
            raise serializers.ValidationError('Phone number is too short.')
        return cleaned

    def validate_payment_last4(self, value):
        cleaned = (value or '').strip()
        if cleaned and (len(cleaned) != 4 or not cleaned.isdigit()):
            raise serializers.ValidationError('Card last 4 digits must be exactly 4 numbers.')
        return cleaned

    def validate(self, attrs):
        delivery_method = attrs.get('delivery_method')
        payment_method = attrs.get('payment_method')

        address = (attrs.get('address') or '').strip()
        city = (attrs.get('city') or '').strip()
        state = (attrs.get('state') or '').strip()
        zip_code = (attrs.get('zip_code') or '').strip()

        if delivery_method == PharmacyOrder.DeliveryMethod.DELIVERY:
            missing = []
            if not address:
                missing.append('address')
            if not city:
                missing.append('city')
            if not state:
                missing.append('state')
            if missing:
                raise serializers.ValidationError({
                    'delivery_details': f"Delivery orders require: {', '.join(missing)}"
                })

        if payment_method == PharmacyOrder.PaymentMethod.CARD and not attrs.get('payment_last4'):
            raise serializers.ValidationError({'payment_last4': 'Card payments require last 4 digits.'})

        attrs['address'] = address
        attrs['city'] = city
        attrs['state'] = state
        attrs['zip_code'] = zip_code
        attrs['notes'] = (attrs.get('notes') or '').strip()
        attrs['client_request_id'] = (attrs.get('client_request_id') or '').strip()

        return attrs


class PharmacyTemplatePurchaseSerializer(serializers.ModelSerializer):
    """Read serializer for pharmacy template purchases."""

    class Meta:
        model = PharmacyTemplatePurchase
        fields = [
            'id',
            'template_id',
            'template_name',
            'amount',
            'payment_method',
            'transaction_reference',
            'status',
            'purchased_at',
            'cancelled_at',
            'created_at',
            'updated_at',
        ]


class PurchaseTemplateSerializer(serializers.Serializer):
    """Input serializer for template purchase/activation."""

    template_id = serializers.IntegerField(min_value=1)
    payment_method = serializers.ChoiceField(choices=PharmacyTemplatePurchase.PaymentMethod.choices)
    transaction_reference = serializers.CharField(required=False, allow_blank=True, max_length=255)


class CancelTemplatePurchaseSerializer(serializers.Serializer):
    """Input serializer for template purchase cancellation."""

    template_id = serializers.IntegerField(min_value=1)
