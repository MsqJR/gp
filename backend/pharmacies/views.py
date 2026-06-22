import csv
import logging
import re
import uuid
from decimal import Decimal, InvalidOperation
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import Max, Q
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.models import WebsiteSetup
from pharmacies.models import Pharmacy, PharmacyOrder, PharmacyOrderItem, PharmacyTemplatePurchase, Product
from pharmacies.google_sheet import (
    GoogleSheetAccessError,
    GoogleSheetWriteError,
    fetch_google_sheet_csv,
    get_service_account_email,
    pharmacy_sheet_push_available,
    push_products_to_connected_sheet,
)
from pharmacies.sheet_sync import SHEET_SYNC_INTERVAL_SECONDS
from pharmacies.serializers import (
    CancelTemplatePurchaseSerializer,
    PharmacyCreateUpdateSerializer,
    PharmacyOrderCreateSerializer,
    PharmacyOrderSerializer,
    PharmacyOrderStatusUpdateSerializer,
    PharmacySerializer,
    PharmacyTemplatePurchaseSerializer,
    PurchaseTemplateSerializer,
    ProductBulkUploadFromSheetSerializer,
    ProductBulkUploadSerializer,
    ProductConnectGoogleSheetSerializer,
    ProductCreateUpdateSerializer,
    ProductSerializer,
)


logger = logging.getLogger(__name__)
user_model = get_user_model()


def _generate_order_number() -> str:
    return f"ORD-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def _normalize_column_token(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').strip().lower())


CSV_COLUMN_ALIASES = {
    'name': 'name',
    'productname': 'name',
    'product': 'name',
    'itemname': 'name',
    'category': 'category',
    'productcategory': 'category',
    'type': 'category',
    'price': 'price',
    'unitprice': 'price',
    'sellingprice': 'price',
    'productprice': 'price',
    'stock': 'stock',
    'stockquantity': 'stock',
    'quantity': 'stock',
    'qty': 'stock',
    'stockqty': 'stock',
    'description': 'description',
    'productdescription': 'description',
    'details': 'description',
    'imageurl': 'image_url',
    'image': 'image_url',
    'imagelink': 'image_url',
}


REQUIRED_UPLOAD_COLUMNS = {'name', 'category', 'price', 'stock', 'description'}

REQUIRED_UPLOAD_COLUMN_LABELS = {
    'name': 'Product Name',
    'category': 'Category',
    'price': 'Price',
    'stock': 'Stock Quantity',
    'description': 'Description',
}


PHARMACY_TEMPLATE_CATALOG = {
    1: {'name': 'Modern Pharmacy', 'price': Decimal('25.00')},
    2: {'name': 'Classic Pharmacy', 'price': Decimal('20.00')},
    3: {'name': 'Minimal Pharmacy', 'price': Decimal('15.00')},
    4: {'name': 'ZenCare Pharmacy', 'price': Decimal('28.00')},
    5: {'name': 'PulsePlus Pharmacy', 'price': Decimal('24.00')},
    6: {'name': 'BloomRx Pharmacy', 'price': Decimal('22.00')},
}

HTTP_IMAGE_URL_VALIDATOR = URLValidator(schemes=['http', 'https'])


def _normalize_image_url(raw_value: str) -> str:
    value = (raw_value or '').strip()
    if not value:
        return ''

    try:
        HTTP_IMAGE_URL_VALIDATOR(value)
    except ValidationError:
        return ''

    return value


def _coerce_price_decimal(raw_value: str) -> Decimal:
    value = (raw_value or '').strip()
    if not value:
        raise ValueError('price is required')

    numeric_text = re.sub(r'[^0-9,\.\-]', '', value)
    if not numeric_text:
        raise ValueError('price is required')

    if ',' in numeric_text and '.' in numeric_text:
        if numeric_text.rfind(',') > numeric_text.rfind('.'):
            numeric_text = numeric_text.replace('.', '').replace(',', '.')
        else:
            numeric_text = numeric_text.replace(',', '')
    elif ',' in numeric_text:
        parts = numeric_text.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            numeric_text = numeric_text.replace(',', '.')
        else:
            numeric_text = numeric_text.replace(',', '')

    try:
        parsed = Decimal(numeric_text)
    except InvalidOperation as exc:
        raise ValueError('price must be a valid number') from exc

    if parsed < 0:
        raise ValueError('price cannot be negative')

    return parsed


def _coerce_stock_integer(raw_value: str) -> int:
    value = (raw_value or '').strip()
    if not value:
        raise ValueError('stock quantity is required')

    numeric_text = re.sub(r'[^0-9,\.\-]', '', value)
    if not numeric_text:
        raise ValueError('stock quantity is required')

    if ',' in numeric_text and '.' in numeric_text:
        if numeric_text.rfind(',') > numeric_text.rfind('.'):
            numeric_text = numeric_text.replace('.', '').replace(',', '.')
        else:
            numeric_text = numeric_text.replace(',', '')
    elif ',' in numeric_text:
        parts = numeric_text.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            numeric_text = numeric_text.replace(',', '.')
        else:
            numeric_text = numeric_text.replace(',', '')

    try:
        parsed = Decimal(numeric_text)
    except InvalidOperation as exc:
        raise ValueError('stock must be an integer') from exc

    if parsed != parsed.to_integral_value():
        raise ValueError('stock must be an integer')

    stock = int(parsed)
    if stock < 0:
        raise ValueError('stock cannot be negative')

    return stock


def _default_subdomain(email: str) -> str:
    candidate = slugify((email or '').split('@')[0])
    return candidate or 'medify-site'


def _build_default_pharmacy_name(user) -> str:
    base_name = (getattr(user, 'name', '') or '').strip()
    return f"{base_name} Pharmacy" if base_name else 'My Pharmacy'


class PharmacyViewSet(viewsets.GenericViewSet):
    """Endpoints for the authenticated user's pharmacy website profile."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _get_or_create_website_setup(self):
        return WebsiteSetup.objects.get_or_create(
            user=self.request.user,
            defaults={'subdomain': _default_subdomain(self.request.user.email)},
        )

    def _get_or_create_pharmacy(self):
        website_setup, _ = self._get_or_create_website_setup()
        pharmacy, _ = Pharmacy.objects.get_or_create(
            user=self.request.user,
            defaults={
                'website_setup': website_setup,
                'name': _build_default_pharmacy_name(self.request.user),
                'template_id': website_setup.template_id,
            },
        )

        updates = []
        if not pharmacy.website_setup_id:
            pharmacy.website_setup = website_setup
            updates.append('website_setup')
        if pharmacy.template_id is None and website_setup.template_id is not None:
            pharmacy.template_id = website_setup.template_id
            updates.append('template_id')
        if updates:
            pharmacy.save(update_fields=updates + ['updated_at'])

        return pharmacy

    def _sync_selected_template_state(self, pharmacy, selected_template_id):
        pharmacy.template_id = selected_template_id
        pharmacy.save(update_fields=['template_id', 'updated_at'])

        if not pharmacy.website_setup_id:
            return

        website_setup = pharmacy.website_setup
        website_setup.template_id = selected_template_id

        if selected_template_id is None:
            website_setup.is_paid = False
            website_setup.total_price = Decimal('0.00')
        else:
            active_purchase = pharmacy.template_purchases.filter(
                template_id=selected_template_id,
                status=PharmacyTemplatePurchase.Status.ACTIVE,
            ).first()
            if active_purchase:
                website_setup.is_paid = True
                website_setup.total_price = active_purchase.amount
            else:
                website_setup.is_paid = False
                website_setup.total_price = Decimal('0.00')

        website_setup.save(update_fields=['template_id', 'is_paid', 'total_price', 'updated_at'])

    @action(detail=False, methods=['get', 'post', 'patch', 'put'])
    def profile(self, request):
        """
        Get/Create/Update pharmacy profile.

        - GET: current pharmacy profile.
        - POST: create or upsert profile.
        - PATCH/PUT: update profile.
        """
        pharmacy = self._get_or_create_pharmacy()

        if request.method == 'GET':
            serializer = PharmacySerializer(pharmacy, context={'request': request})
            return Response(serializer.data)

        partial = request.method in ['PATCH', 'POST']
        serializer = PharmacyCreateUpdateSerializer(pharmacy, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        requested_template_id = None
        has_template_update = 'template_id' in serializer.validated_data
        if has_template_update:
            requested_template_id = serializer.validated_data.get('template_id')
            if requested_template_id is not None:
                has_active_purchase = pharmacy.template_purchases.filter(
                    template_id=requested_template_id,
                    status=PharmacyTemplatePurchase.Status.ACTIVE,
                ).exists()
                if not has_active_purchase:
                    return Response(
                        {'detail': 'Please purchase this template before activating it.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        serializer.save()

        if has_template_update:
            self._sync_selected_template_state(pharmacy, requested_template_id)

        response_serializer = PharmacySerializer(pharmacy, context={'request': request})
        return Response(response_serializer.data)

    @action(detail=False, methods=['get'])
    def template_purchases(self, request):
        """List template purchase records for the authenticated pharmacy owner."""
        pharmacy = self._get_or_create_pharmacy()
        purchases = pharmacy.template_purchases.all().order_by('template_id')
        serializer = PharmacyTemplatePurchaseSerializer(purchases, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def purchase_template(self, request):
        """Create or reactivate a template purchase, then set it as active template."""
        pharmacy = self._get_or_create_pharmacy()
        serializer = PurchaseTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        template_id = serializer.validated_data['template_id']
        template_info = PHARMACY_TEMPLATE_CATALOG.get(template_id)
        if not template_info:
            return Response(
                {'detail': 'Invalid template id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not pharmacy.website_setup_id:
            website_setup, _ = self._get_or_create_website_setup()
            pharmacy.website_setup = website_setup
            pharmacy.save(update_fields=['website_setup', 'updated_at'])

        purchase, created = PharmacyTemplatePurchase.objects.get_or_create(
            pharmacy=pharmacy,
            template_id=template_id,
            defaults={
                'website_setup': pharmacy.website_setup,
                'template_name': template_info['name'],
                'amount': template_info['price'],
                'payment_method': serializer.validated_data['payment_method'],
                'transaction_reference': serializer.validated_data.get('transaction_reference', '').strip(),
                'status': PharmacyTemplatePurchase.Status.ACTIVE,
            },
        )

        if not created:
            purchase.website_setup = pharmacy.website_setup
            purchase.template_name = template_info['name']
            purchase.amount = template_info['price']
            purchase.payment_method = serializer.validated_data['payment_method']
            purchase.transaction_reference = serializer.validated_data.get('transaction_reference', '').strip()
            purchase.status = PharmacyTemplatePurchase.Status.ACTIVE
            purchase.cancelled_at = None
            purchase.save(
                update_fields=[
                    'website_setup',
                    'template_name',
                    'amount',
                    'payment_method',
                    'transaction_reference',
                    'status',
                    'cancelled_at',
                    'updated_at',
                ]
            )

        self._sync_selected_template_state(pharmacy, template_id)

        return Response(
            {
                'purchase': PharmacyTemplatePurchaseSerializer(purchase).data,
                'profile': PharmacySerializer(pharmacy, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def cancel_template_purchase(self, request):
        """Cancel an active purchase for the given template id."""
        pharmacy = self._get_or_create_pharmacy()
        serializer = CancelTemplatePurchaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        template_id = serializer.validated_data['template_id']
        purchase = pharmacy.template_purchases.filter(
            template_id=template_id,
            status=PharmacyTemplatePurchase.Status.ACTIVE,
        ).first()

        if not purchase:
            return Response(
                {'detail': 'No active purchase exists for this template.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        purchase.status = PharmacyTemplatePurchase.Status.CANCELLED
        purchase.cancelled_at = timezone.now()
        purchase.save(update_fields=['status', 'cancelled_at', 'updated_at'])

        fallback_active = pharmacy.template_purchases.filter(
            status=PharmacyTemplatePurchase.Status.ACTIVE,
        ).order_by('-updated_at').first()
        active_template_id = fallback_active.template_id if fallback_active else None
        self._sync_selected_template_state(pharmacy, active_template_id)

        return Response(
            {
                'cancelled_purchase': PharmacyTemplatePurchaseSerializer(purchase).data,
                'active_template_id': active_template_id,
                'profile': PharmacySerializer(pharmacy, context={'request': request}).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def publish(self, request):
        """Publish pharmacy website."""
        pharmacy = self._get_or_create_pharmacy()
        pharmacy.is_published = True
        pharmacy.save(update_fields=['is_published', 'updated_at'])

        if pharmacy.website_setup_id:
            business_info = getattr(pharmacy.website_setup, 'business_info', None)
            if business_info and not business_info.is_published:
                business_info.is_published = True
                business_info.save(update_fields=['is_published', 'updated_at'])

        serializer = PharmacySerializer(pharmacy, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['delete'])
    def delete_website(self, request):
        """Delete pharmacy website configuration and product catalog."""
        pharmacy = Pharmacy.objects.filter(user=request.user).select_related('website_setup').first()
        if not pharmacy:
            return Response({'detail': 'Pharmacy profile was not found.'}, status=status.HTTP_404_NOT_FOUND)

        website_setup = pharmacy.website_setup
        Product.objects.filter(Q(pharmacy=pharmacy) | Q(website_setup=website_setup)).delete()

        if website_setup and hasattr(website_setup, 'business_info'):
            website_setup.business_info.delete()

        pharmacy.delete()

        if website_setup:
            website_setup.template_id = None
            website_setup.ai_chatbot = False
            website_setup.save(update_fields=['template_id', 'ai_chatbot', 'updated_at'])

        return Response({'message': 'Pharmacy website deleted successfully.'}, status=status.HTTP_200_OK)


class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet for managing pharmacy products"""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'in_stock']
    search_fields = ['name', 'category', 'description']
    ordering_fields = ['created_at', 'updated_at', 'price', 'name', 'stock']
    ordering = ['-updated_at']

    def _get_or_create_website_setup(self):
        return WebsiteSetup.objects.get_or_create(
            user=self.request.user,
            defaults={'subdomain': _default_subdomain(self.request.user.email)},
        )

    def _get_or_create_pharmacy(self):
        website_setup, _ = self._get_or_create_website_setup()
        pharmacy, _ = Pharmacy.objects.get_or_create(
            user=self.request.user,
            defaults={
                'website_setup': website_setup,
                'name': _build_default_pharmacy_name(self.request.user),
                'template_id': website_setup.template_id,
            },
        )
        if not pharmacy.website_setup_id:
            pharmacy.website_setup = website_setup
            pharmacy.save(update_fields=['website_setup', 'updated_at'])
        return pharmacy, website_setup

    def get_queryset(self):
        """Only return products for the current user's pharmacy."""
        queryset = Product.objects.select_related('pharmacy', 'website_setup').filter(
            Q(pharmacy__user=self.request.user) | Q(website_setup__user=self.request.user)
        ).distinct().order_by('-updated_at')

        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__iexact=category)

        return queryset

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ProductCreateUpdateSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        """Associate product with user's pharmacy and website setup."""
        pharmacy, website_setup = self._get_or_create_pharmacy()

        payload = {'pharmacy': pharmacy, 'website_setup': website_setup}
        if self.request.FILES.get('image'):
            payload['image_url'] = ''

        serializer.save(**payload)
        self._maybe_push_to_google_sheet(pharmacy)

    def perform_update(self, serializer):
        if self.request.FILES.get('image'):
            serializer.save(image_url='')
        else:
            serializer.save()

        pharmacy = serializer.instance.pharmacy
        if not pharmacy:
            pharmacy, _ = self._get_or_create_pharmacy()
        self._maybe_push_to_google_sheet(pharmacy)

    def perform_destroy(self, instance):
        pharmacy = instance.pharmacy
        if not pharmacy:
            pharmacy, _ = self._get_or_create_pharmacy()
        instance.delete()
        self._maybe_push_to_google_sheet(pharmacy)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        total = queryset.count()
        out_of_stock = queryset.filter(stock=0).count()
        low_stock = queryset.filter(stock__gt=0, stock__lt=5).count()
        categories = queryset.values_list('category', flat=True).distinct().count()
        last_updated = queryset.aggregate(last_updated=Max('updated_at'))['last_updated']

        return Response({
            'total': total,
            'out_of_stock': out_of_stock,
            'low_stock': low_stock,
            'categories': categories,
            'last_updated': last_updated,
        })

    def _resolve_upload_column(self, raw_key: str) -> str | None:
        token = _normalize_column_token(raw_key)
        return CSV_COLUMN_ALIASES.get(token)

    def _normalize_uploaded_row(self, raw_row, row_number):
        cleaned = {}
        original_data = {}

        for key, value in (raw_row or {}).items():
            raw_key = str(key).strip() if key is not None else ''
            raw_value = str(value).strip() if value is not None else ''

            if raw_key:
                original_data[raw_key] = raw_value

            canonical_key = self._resolve_upload_column(raw_key)
            if not canonical_key:
                continue

            existing_value = cleaned.get(canonical_key, '')
            if raw_value or not existing_value:
                cleaned[canonical_key] = raw_value

        errors = []
        name = cleaned.get('name', '').strip()
        if not name:
            errors.append('product name is required')

        category = cleaned.get('category', '').strip() or 'General'
        description = cleaned.get('description', '').strip()

        price_value = cleaned.get('price', '').strip()
        try:
            price = _coerce_price_decimal(price_value)
        except ValueError as exc:
            errors.append(str(exc))
            price = Decimal('0')

        stock_raw = cleaned.get('stock', '').strip()
        try:
            stock = _coerce_stock_integer(stock_raw)
        except ValueError as exc:
            errors.append(str(exc))
            stock = 0

        image_url = _normalize_image_url(cleaned.get('image_url', ''))

        if errors:
            return None, {
                'row': row_number,
                'errors': errors,
                'data': original_data,
            }

        return {
            'name': name,
            'category': category,
            'description': description,
            'price': price,
            'stock': stock,
            'image_url': image_url,
            '__row_number': row_number,
            '__raw_data': original_data,
        }, None

    def _parse_csv_content(self, decoded_content):
        if not decoded_content.strip():
            return [], [
                {
                    'row': 1,
                    'errors': ['CSV file is empty.'],
                    'data': {},
                }
            ]

        try:
            dialect = csv.Sniffer().sniff(decoded_content[:2048], delimiters=',;\t|')
        except csv.Error:
            dialect = csv.excel

        reader = csv.DictReader(StringIO(decoded_content), dialect=dialect)

        source_headers = [str(field).strip() for field in (reader.fieldnames or []) if field]
        canonical_headers = {
            resolved
            for resolved in (self._resolve_upload_column(field) for field in source_headers)
            if resolved
        }

        missing = sorted(REQUIRED_UPLOAD_COLUMNS - canonical_headers)
        if missing:
            missing_labels = [REQUIRED_UPLOAD_COLUMN_LABELS[column] for column in missing]
            return [], [
                {
                    'row': 1,
                    'errors': [f"Missing required columns: {', '.join(missing_labels)}"],
                    'data': {'headers': source_headers},
                }
            ]

        valid_rows = []
        failed_rows = []

        for row_index, row in enumerate(reader, start=2):
            if not any(str(value).strip() for value in (row or {}).values()):
                continue

            normalized, error = self._normalize_uploaded_row(row, row_index)
            if error:
                failed_rows.append(error)
                continue
            valid_rows.append(normalized)

        return valid_rows, failed_rows

    def _parse_csv_upload(self, uploaded_file):
        uploaded_file.seek(0)
        raw_file_content = uploaded_file.read()
        decoded_content = (
            raw_file_content.decode('utf-8-sig', errors='replace')
            if isinstance(raw_file_content, bytes)
            else str(raw_file_content)
        )
        return self._parse_csv_content(decoded_content)

    def _parse_json_upload(self, payload_rows):
        valid_rows = []
        failed_rows = []

        for row_index, row in enumerate(payload_rows, start=1):
            normalized, error = self._normalize_uploaded_row(row, row_index)
            if error:
                failed_rows.append(error)
                continue
            valid_rows.append(normalized)

        return valid_rows, failed_rows

    def _product_row_key(self, name: str, category: str) -> tuple[str, str]:
        return (name.strip().lower(), (category or 'General').strip().lower())

    def _apply_product_rows(
        self,
        request,
        pharmacy,
        website_setup,
        products_data,
        failed_rows,
        *,
        remove_missing: bool = False,
    ):
        if not products_data and failed_rows:
            failed_count = len(failed_rows)
            return {
                'ok': False,
                'status_code': status.HTTP_400_BAD_REQUEST,
                'message': 'No valid rows found in upload.',
                'success_count': 0,
                'created_count': 0,
                'updated_count': 0,
                'deleted_count': 0,
                'failed_count': failed_count,
                'processed_count': failed_count,
                'failed_rows': failed_rows,
                'preview_count': 0,
            }

        created_count = 0
        updated_count = 0
        synced_keys: set[tuple[str, str]] = set()

        for row_index, product_data in enumerate(products_data, start=1):
            row_number = product_data.get('__row_number', row_index)
            row_payload = {
                'name': product_data.get('name', ''),
                'category': product_data.get('category', 'General'),
                'description': product_data.get('description', ''),
                'image_url': product_data.get('image_url', ''),
                'price': product_data.get('price', Decimal('0')),
                'stock': product_data.get('stock', 0),
            }
            synced_keys.add(self._product_row_key(row_payload['name'], row_payload['category']))

            try:
                with transaction.atomic():
                    existing_product = Product.objects.filter(
                        pharmacy=pharmacy,
                        website_setup=website_setup,
                        name__iexact=row_payload['name'],
                        category__iexact=row_payload['category'],
                    ).first()

                    if existing_product:
                        existing_product.description = row_payload['description']
                        existing_product.price = row_payload['price']
                        existing_product.stock = row_payload['stock']
                        existing_product.image_url = row_payload['image_url']
                        existing_product.save()
                        updated_count += 1
                    else:
                        Product.objects.create(
                            pharmacy=pharmacy,
                            website_setup=website_setup,
                            name=row_payload['name'],
                            category=row_payload['category'],
                            description=row_payload['description'],
                            image_url=row_payload['image_url'],
                            price=row_payload['price'],
                            stock=row_payload['stock'],
                        )
                        created_count += 1
            except Exception as exc:
                logger.warning(
                    "Bulk product upload row failed for user %s at row %s: %s",
                    request.user.id,
                    row_number,
                    exc,
                )
                failed_rows.append({
                    'row': row_number,
                    'errors': ['Database write failed for this row.'],
                    'data': product_data.get('__raw_data', {}),
                })
                continue

        deleted_count = 0
        if remove_missing:
            for product in Product.objects.filter(pharmacy=pharmacy, website_setup=website_setup):
                product_key = self._product_row_key(product.name, product.category)
                if product_key not in synced_keys:
                    product.delete()
                    deleted_count += 1

        if failed_rows:
            logger.warning(
                "Bulk product upload finished with %s failed rows for user %s",
                len(failed_rows),
                request.user.id,
            )

        failed_count = len(failed_rows)
        status_code = status.HTTP_201_CREATED if not failed_rows else status.HTTP_200_OK
        return {
            'ok': True,
            'status_code': status_code,
            'message': f'{created_count} products created, {updated_count} products updated',
            'success_count': created_count + updated_count,
            'created_count': created_count,
            'updated_count': updated_count,
            'deleted_count': deleted_count,
            'failed_count': failed_count,
            'processed_count': created_count + updated_count + failed_count,
            'failed_rows': failed_rows,
            'preview_count': len(products_data),
        }

    def _persist_bulk_upload(self, request, pharmacy, website_setup, products_data, failed_rows, *, remove_missing=False):
        result = self._apply_product_rows(
            request,
            pharmacy,
            website_setup,
            products_data,
            failed_rows,
            remove_missing=remove_missing,
        )
        response_status = result.pop('status_code', status.HTTP_200_OK)
        result.pop('ok', True)
        return Response(result, status=response_status)

    def _maybe_push_to_google_sheet(self, pharmacy):
        if not pharmacy or not pharmacy.google_sheet_sync_enabled or not pharmacy.google_sheet_url:
            return {'pushed': False, 'reason': 'not_connected'}

        try:
            products = Product.objects.filter(pharmacy=pharmacy).order_by('category', 'name', 'id')
            push_products_to_connected_sheet(pharmacy, products)
            pharmacy.google_sheet_last_pushed_at = timezone.now()
            pharmacy.save(update_fields=['google_sheet_last_pushed_at', 'updated_at'])
            return {'pushed': True, 'pushed_at': pharmacy.google_sheet_last_pushed_at}
        except GoogleSheetWriteError as exc:
            logger.warning('Google Sheet push failed for pharmacy %s: %s', pharmacy.id, exc)
            return {'pushed': False, 'error': str(exc)}

    def _should_sync_google_sheet(self, pharmacy, force: bool = False) -> bool:
        if not pharmacy.google_sheet_sync_enabled or not pharmacy.google_sheet_url:
            return False
        if force:
            return True
        if pharmacy.google_sheet_last_pushed_at:
            since_push = (timezone.now() - pharmacy.google_sheet_last_pushed_at).total_seconds()
            if since_push < SHEET_SYNC_INTERVAL_SECONDS:
                return False
        if not pharmacy.google_sheet_last_synced_at:
            return True
        elapsed = (timezone.now() - pharmacy.google_sheet_last_synced_at).total_seconds()
        return elapsed >= SHEET_SYNC_INTERVAL_SECONDS

    def _sync_from_google_sheet(self, request, pharmacy, website_setup, *, force: bool = False):
        if not self._should_sync_google_sheet(pharmacy, force=force):
            return {'synced': False, 'reason': 'throttled'}

        try:
            csv_content = fetch_google_sheet_csv(pharmacy.google_sheet_url)
        except GoogleSheetAccessError as exc:
            return {'synced': False, 'error': str(exc)}

        products_data, failed_rows = self._parse_csv_content(csv_content)
        result = self._apply_product_rows(
            request,
            pharmacy,
            website_setup,
            products_data,
            failed_rows,
            remove_missing=True,
        )

        pharmacy.google_sheet_last_synced_at = timezone.now()
        pharmacy.save(update_fields=['google_sheet_last_synced_at', 'updated_at'])

        return {
            'synced': True,
            'created_count': result.get('created_count', 0),
            'updated_count': result.get('updated_count', 0),
            'deleted_count': result.get('deleted_count', 0),
            'failed_count': result.get('failed_count', 0),
            'failed_rows': result.get('failed_rows', []),
            'synced_at': pharmacy.google_sheet_last_synced_at,
        }

    def list(self, request, *args, **kwargs):
        pharmacy, website_setup = self._get_or_create_pharmacy()
        force_sync = request.query_params.get('sync') in {'1', 'true', 'yes'}
        if pharmacy.google_sheet_sync_enabled and pharmacy.google_sheet_url:
            self._sync_from_google_sheet(request, pharmacy, website_setup, force=force_sync)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def bulk_upload(self, request):
        """
        Bulk upload products from CSV or JSON list.

        CSV accepts common aliases such as Product Name and Stock Quantity.
        """
        pharmacy, website_setup = self._get_or_create_pharmacy()

        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            products_data, failed_rows = self._parse_csv_upload(uploaded_file)
        else:
            serializer = ProductBulkUploadSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            products_data, failed_rows = self._parse_json_upload(serializer.validated_data['products'])

        response = self._persist_bulk_upload(request, pharmacy, website_setup, products_data, failed_rows)
        if pharmacy.google_sheet_sync_enabled:
            self._maybe_push_to_google_sheet(pharmacy)
        return response

    @action(detail=False, methods=['post'], url_path='bulk_upload_from_sheet')
    def bulk_upload_from_sheet(self, request):
        """
        Import products from a public Google Sheets / Google Drive share URL.

        Set dry_run=true to validate and preview rows without saving.
        """
        serializer = ProductBulkUploadFromSheetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sheet_url = serializer.validated_data['url']
        dry_run = serializer.validated_data.get('dry_run', False)

        try:
            csv_content = fetch_google_sheet_csv(sheet_url)
        except GoogleSheetAccessError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        products_data, failed_rows = self._parse_csv_content(csv_content)

        if dry_run:
            failed_count = len(failed_rows)
            valid_count = len(products_data)
            if valid_count == 0 and failed_count == 0:
                return Response(
                    {
                        'message': 'No product rows found in the Google Sheet.',
                        'preview_count': 0,
                        'failed_count': 0,
                        'failed_rows': [],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    'message': f'{valid_count} valid rows ready to import.',
                    'preview_count': valid_count,
                    'failed_count': failed_count,
                    'failed_rows': failed_rows,
                    'preview_rows': [
                        {
                            'name': row.get('name', ''),
                            'category': row.get('category', ''),
                            'price': str(row.get('price', '')),
                            'stock': row.get('stock', 0),
                        }
                        for row in products_data[:6]
                    ],
                },
                status=status.HTTP_200_OK,
            )

        pharmacy, website_setup = self._get_or_create_pharmacy()
        enable_live_sync = serializer.validated_data.get('enable_live_sync', True)
        if enable_live_sync:
            pharmacy.google_sheet_url = sheet_url
            pharmacy.google_sheet_sync_enabled = True
            pharmacy.save(update_fields=['google_sheet_url', 'google_sheet_sync_enabled', 'updated_at'])

        response = self._persist_bulk_upload(
            request,
            pharmacy,
            website_setup,
            products_data,
            failed_rows,
            remove_missing=enable_live_sync,
        )
        if enable_live_sync:
            pharmacy.google_sheet_last_synced_at = timezone.now()
            pharmacy.save(update_fields=['google_sheet_last_synced_at', 'updated_at'])
        return response

    @action(detail=False, methods=['get'], url_path='sheet_sync_status')
    def sheet_sync_status(self, request):
        pharmacy, _ = self._get_or_create_pharmacy()
        return Response({
            'google_sheet_url': pharmacy.google_sheet_url,
            'google_sheet_webhook_url': pharmacy.google_sheet_webhook_url,
            'google_sheet_sync_enabled': pharmacy.google_sheet_sync_enabled,
            'google_sheet_last_synced_at': pharmacy.google_sheet_last_synced_at,
            'google_sheet_last_pushed_at': pharmacy.google_sheet_last_pushed_at,
            'google_sheets_write_configured': pharmacy_sheet_push_available(pharmacy),
            'google_service_account_email': get_service_account_email(),
            'sync_interval_seconds': SHEET_SYNC_INTERVAL_SECONDS,
        })

    @action(detail=False, methods=['post'], url_path='connect_google_sheet')
    def connect_google_sheet(self, request):
        serializer = ProductConnectGoogleSheetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        pharmacy, website_setup = self._get_or_create_pharmacy()
        pharmacy.google_sheet_url = serializer.validated_data['url']
        pharmacy.google_sheet_webhook_url = (serializer.validated_data.get('webhook_url') or '').strip()
        pharmacy.google_sheet_sync_enabled = True
        pharmacy.save(update_fields=[
            'google_sheet_url',
            'google_sheet_webhook_url',
            'google_sheet_sync_enabled',
            'updated_at',
        ])

        sync_result = self._sync_from_google_sheet(request, pharmacy, website_setup, force=True)
        return Response({
            'message': 'Google Sheet connected for live sync.',
            'google_sheet_url': pharmacy.google_sheet_url,
            'google_sheet_webhook_url': pharmacy.google_sheet_webhook_url,
            'google_sheet_sync_enabled': pharmacy.google_sheet_sync_enabled,
            'google_sheet_last_synced_at': pharmacy.google_sheet_last_synced_at,
            'google_sheet_last_pushed_at': pharmacy.google_sheet_last_pushed_at,
            'google_sheets_write_configured': pharmacy_sheet_push_available(pharmacy),
            'google_service_account_email': get_service_account_email(),
            'sync_interval_seconds': SHEET_SYNC_INTERVAL_SECONDS,
            'sync': sync_result,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='disconnect_google_sheet')
    def disconnect_google_sheet(self, request):
        pharmacy, _ = self._get_or_create_pharmacy()
        pharmacy.google_sheet_url = ''
        pharmacy.google_sheet_webhook_url = ''
        pharmacy.google_sheet_sync_enabled = False
        pharmacy.google_sheet_last_synced_at = None
        pharmacy.google_sheet_last_pushed_at = None
        pharmacy.save(update_fields=[
            'google_sheet_url',
            'google_sheet_webhook_url',
            'google_sheet_sync_enabled',
            'google_sheet_last_synced_at',
            'google_sheet_last_pushed_at',
            'updated_at',
        ])
        return Response({
            'message': 'Google Sheet live sync disconnected.',
            'google_sheet_sync_enabled': False,
        })

    @action(
        detail=False,
        methods=['get'],
        url_path='public',
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def public_list(self, request):
        owner_id = request.query_params.get('owner_id')
        if not owner_id:
            return Response({'error': 'owner_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = Pharmacy.objects.select_related('website_setup', 'user').filter(user_id=owner_id).first()
        if not pharmacy:
            return Response({'error': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)

        website_setup = pharmacy.website_setup
        force_sync = request.query_params.get('sync') in {'1', 'true', 'yes'}
        sync_result = None
        if pharmacy.google_sheet_sync_enabled and pharmacy.google_sheet_url:
            sync_result = self._sync_from_google_sheet(request, pharmacy, website_setup, force=force_sync)

        products = Product.objects.filter(pharmacy=pharmacy).order_by('-updated_at')
        serializer = ProductSerializer(products, many=True, context={'request': request})
        return Response({
            'products': serializer.data,
            'google_sheet_sync_enabled': pharmacy.google_sheet_sync_enabled,
            'google_sheet_last_synced_at': pharmacy.google_sheet_last_synced_at,
            'sync_interval_seconds': SHEET_SYNC_INTERVAL_SECONDS,
            'sync': sync_result,
        })

    @action(detail=False, methods=['get'])
    def debug_info(self, request):
        """Debug endpoint to check product data"""
        products = self.get_queryset()[:10]
        return Response({
            'total_count': self.get_queryset().count(),
            'sample_products': [
                {
                    'id': str(p.id),
                    'pharmacy_id': str(p.pharmacy_id) if p.pharmacy_id else None,
                    'name': p.name,
                    'stock': p.stock,
                    'stock_type': type(p.stock).__name__,
                    'in_stock': p.in_stock,
                    'price': str(p.price),
                }
                for p in products
            ]
        })

    @action(detail=False, methods=['delete'])
    def delete_all(self, request):
        """Delete all products for current user"""
        pharmacy, _ = self._get_or_create_pharmacy()
        owned_products = Product.objects.filter(
            Q(pharmacy__user=request.user) | Q(website_setup__user=request.user)
        )
        count = owned_products.count()
        owned_products.delete()
        push_result = self._maybe_push_to_google_sheet(pharmacy)
        return Response({
            'message': f'{count} products deleted successfully',
            'sheet_push': push_result,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Get products grouped by category"""
        products = self.get_queryset().order_by('category', 'name')
        categories = {}

        for product in products:
            if product.category not in categories:
                categories[product.category] = []
            categories[product.category].append(ProductSerializer(product, context={'request': request}).data)

        return Response(categories)


class PharmacyOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """Order creation (public) and owner-side order management endpoints."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]
    serializer_class = PharmacyOrderSerializer
    pagination_class = None

    def get_authenticators(self):
        if getattr(self, 'action', None) == 'place':
            return []
        return super().get_authenticators()

    def get_permissions(self):
        if getattr(self, 'action', None) == 'place':
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return PharmacyOrder.objects.none()

        return PharmacyOrder.objects.select_related('pharmacy', 'website_setup').prefetch_related('items').filter(
            Q(pharmacy__user=self.request.user) | Q(website_setup__user=self.request.user)
        ).distinct().order_by('-created_at')

    def _get_unseen_confirmed_orders_queryset(self):
        return self.get_queryset().filter(
            owner_seen_at__isnull=True,
        ).filter(
            Q(payment_status=PharmacyOrder.PaymentStatus.PAID) | Q(status=PharmacyOrder.Status.COMPLETED),
        )

    def _get_or_create_owner_context(self, owner_id):
        owner = user_model.objects.filter(id=owner_id, business_type='pharmacy').first()
        if not owner:
            raise DRFValidationError('Pharmacy owner not found for the provided owner_id.')

        website_setup, _ = WebsiteSetup.objects.get_or_create(
            user=owner,
            defaults={'subdomain': _default_subdomain(owner.email)},
        )
        pharmacy, _ = Pharmacy.objects.get_or_create(
            user=owner,
            defaults={
                'website_setup': website_setup,
                'name': _build_default_pharmacy_name(owner),
                'template_id': website_setup.template_id,
            },
        )

        if not pharmacy.website_setup_id:
            pharmacy.website_setup = website_setup
            pharmacy.save(update_fields=['website_setup', 'updated_at'])

        return pharmacy, website_setup

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def unseen_count(self, request):
        return Response({'count': self._get_unseen_confirmed_orders_queryset().count()})

    @action(detail=False, methods=['post'])
    def mark_seen(self, request):
        unseen_queryset = self._get_unseen_confirmed_orders_queryset()
        order_ids = request.data.get('order_ids')

        if isinstance(order_ids, list) and order_ids:
            unseen_queryset = unseen_queryset.filter(id__in=order_ids)

        seen_timestamp = timezone.now()
        marked_seen = unseen_queryset.update(owner_seen_at=seen_timestamp)

        return Response(
            {
                'marked_seen': marked_seen,
                'remaining_unseen': self._get_unseen_confirmed_orders_queryset().count(),
            }
        )

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny], authentication_classes=[])
    def place(self, request):
        serializer = PharmacyOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        pharmacy, website_setup = self._get_or_create_owner_context(payload['owner_id'])

        client_request_id = payload.get('client_request_id', '').strip()
        if client_request_id:
            existing = PharmacyOrder.objects.select_related('pharmacy', 'website_setup').prefetch_related('items').filter(
                website_setup=website_setup,
                client_request_id=client_request_id,
            ).first()
            if existing:
                return Response(
                    {
                        'message': 'Duplicate order submission ignored.',
                        'duplicate': True,
                        'order': PharmacyOrderSerializer(existing, context={'request': request}).data,
                    },
                    status=status.HTTP_200_OK,
                )

        order_items = payload['items']
        product_ids = [item['product_id'] for item in order_items]

        with transaction.atomic():
            products = Product.objects.select_for_update().filter(
                Q(pharmacy=pharmacy) | Q(website_setup=website_setup),
                id__in=product_ids,
            ).distinct()
            product_map = {str(product.id): product for product in products}

            item_errors = []
            for index, item in enumerate(order_items, start=1):
                product = product_map.get(str(item['product_id']))
                quantity = int(item['quantity'])

                if not product:
                    item_errors.append(f'Item {index}: product not found.')
                    continue
                if quantity <= 0:
                    item_errors.append(f'Item {index}: quantity must be at least 1.')
                    continue
                if product.stock < quantity:
                    item_errors.append(
                        f'Item {index}: only {product.stock} units available for {product.name}.',
                    )

            if item_errors:
                return Response(
                    {
                        'detail': 'Order could not be placed due to invalid item quantities.',
                        'items': item_errors,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order = PharmacyOrder.objects.create(
                pharmacy=pharmacy,
                website_setup=website_setup,
                order_number=_generate_order_number(),
                client_request_id=client_request_id,
                patient_name=payload['full_name'],
                patient_email=payload['email'],
                patient_phone=payload['phone'],
                address=payload.get('address', ''),
                city=payload.get('city', ''),
                state=payload.get('state', ''),
                zip_code=payload.get('zip_code', ''),
                delivery_method=payload['delivery_method'],
                payment_method=payload['payment_method'],
                payment_status=(
                    PharmacyOrder.PaymentStatus.PAID
                    if payload['payment_method'] == PharmacyOrder.PaymentMethod.CARD
                    else PharmacyOrder.PaymentStatus.PENDING
                ),
                payment_last4=payload.get('payment_last4', ''),
                notes=payload.get('notes', ''),
                status=PharmacyOrder.Status.PENDING,
                subtotal=Decimal('0.00'),
                delivery_fee=payload.get('delivery_fee', Decimal('0.00')),
                total=Decimal('0.00'),
            )

            subtotal = Decimal('0.00')
            for item in order_items:
                product = product_map[str(item['product_id'])]
                quantity = int(item['quantity'])
                line_total = product.price * quantity

                PharmacyOrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=product.name,
                    product_category=product.category,
                    quantity=quantity,
                    unit_price=product.price,
                    line_total=line_total,
                )

                subtotal += line_total
                product.stock -= quantity
                product.save()

            order.subtotal = subtotal
            order.total = subtotal + order.delivery_fee
            order.status_updated_at = timezone.now()
            order.save(update_fields=['subtotal', 'total', 'status_updated_at', 'updated_at'])

        return Response(
            {
                'message': 'Order placed successfully.',
                'duplicate': False,
                'order': PharmacyOrderSerializer(order, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['patch'])
    def status(self, request, pk=None):
        order = self.get_object()
        serializer = PharmacyOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order.status = serializer.validated_data['status']
        if order.status == PharmacyOrder.Status.COMPLETED:
            order.payment_status = PharmacyOrder.PaymentStatus.PAID
        order.status_updated_at = timezone.now()
        order.save(update_fields=['status', 'payment_status', 'status_updated_at', 'updated_at'])

        return Response(PharmacyOrderSerializer(order, context={'request': request}).data)

    def destroy(self, request, pk=None):
        """Delete a cancelled order (only cancelled orders may be deleted)."""
        order = self.get_object()
        if order.status != PharmacyOrder.Status.CANCELLED:
            return Response(
                {'detail': 'Only cancelled orders can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        return Response(
            {
                'total': queryset.count(),
                'pending': queryset.filter(status=PharmacyOrder.Status.PENDING).count(),
                'processing': queryset.filter(status=PharmacyOrder.Status.PROCESSING).count(),
                'completed': queryset.filter(status=PharmacyOrder.Status.COMPLETED).count(),
                'cancelled': queryset.filter(status=PharmacyOrder.Status.CANCELLED).count(),
            }
        )

    @action(detail=False, methods=['get'])
    def notifications(self, request):
        queryset = self.get_queryset()
        since_raw = (request.query_params.get('since') or '').strip()
        since = parse_datetime(since_raw) if since_raw else None

        if since is not None and timezone.is_naive(since):
            since = timezone.make_aware(since, timezone.get_current_timezone())
        if since is not None:
            queryset = queryset.filter(created_at__gt=since)

        orders = list(queryset.order_by('-created_at')[:10])
        payload = []
        for order in orders:
            first_item = order.items.first()
            payload.append(
                {
                    'id'            : str(order.id),
                    'order_number'  : order.order_number,
                    'patient_name'  : order.patient_name,
                    'status'        : order.status,
                    'created_at'    : order.created_at,
                    'first_product' : first_item.product_name if first_item else '',
                }
            )

        return Response({'count': queryset.count(), 'orders': payload})
