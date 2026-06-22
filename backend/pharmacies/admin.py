from django.contrib import admin
from pharmacies.models import Pharmacy, PharmacyOrder, PharmacyOrderItem, PharmacyTemplatePurchase, Product


@admin.register(Pharmacy)
class PharmacyAdmin(admin.ModelAdmin):
    """Admin interface for Pharmacy model"""

    list_display = ['name', 'user', 'template_id', 'is_published', 'updated_at']
    list_filter = ['is_published', 'template_id', 'updated_at']
    search_fields = ['name', 'user__email', 'user__name', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at']
    list_per_page = 50

    fieldsets = (
        ('Identity', {
            'fields': ('id', 'user', 'website_setup')
        }),
        ('Website Profile', {
            'fields': ('name', 'description', 'logo', 'template_id', 'theme_settings', 'is_published')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    """Admin interface for Product model"""
    list_display = ['name', 'category', 'price', 'stock', 'in_stock', 'pharmacy', 'website_setup', 'created_at']
    list_filter = ['category', 'in_stock', 'created_at']
    search_fields = ['name', 'category', 'description']
    readonly_fields = ['id', 'in_stock', 'created_at', 'updated_at']
    list_per_page = 50

    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'pharmacy', 'website_setup', 'name', 'category')
        }),
        ('Details', {
            'fields': ('description', 'image', 'image_url', 'price', 'stock', 'in_stock')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PharmacyTemplatePurchase)
class PharmacyTemplatePurchaseAdmin(admin.ModelAdmin):
    """Admin interface for template purchase records."""

    list_display = [
        'pharmacy',
        'template_id',
        'template_name',
        'status',
        'amount',
        'payment_method',
        'updated_at',
    ]
    list_filter = ['status', 'payment_method', 'template_id', 'updated_at']
    search_fields = [
        'pharmacy__name',
        'pharmacy__user__email',
        'template_name',
        'transaction_reference',
    ]
    readonly_fields = ['id', 'created_at', 'updated_at', 'purchased_at', 'cancelled_at']
    list_per_page = 50


class PharmacyOrderItemInline(admin.TabularInline):
    model = PharmacyOrderItem
    extra = 0
    readonly_fields = ['id', 'product', 'product_name', 'product_category', 'quantity', 'unit_price', 'line_total']
    can_delete = False


@admin.register(PharmacyOrder)
class PharmacyOrderAdmin(admin.ModelAdmin):
    list_display = [
        'order_number',
        'patient_name',
        'patient_phone',
        'status',
        'payment_method',
        'payment_status',
        'total',
        'created_at',
    ]
    list_filter = ['status', 'delivery_method', 'payment_method', 'payment_status', 'created_at']
    search_fields = ['order_number', 'patient_name', 'patient_email', 'patient_phone']
    readonly_fields = [
        'id',
        'order_number',
        'client_request_id',
        'payment_status',
        'subtotal',
        'delivery_fee',
        'total',
        'created_at',
        'updated_at',
        'status_updated_at',
        'owner_seen_at',
    ]
    inlines = [PharmacyOrderItemInline]
    list_per_page = 50
