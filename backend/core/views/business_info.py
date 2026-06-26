from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from core.models import WebsiteSetup, BusinessInfo
from core.serializers import BusinessInfoSerializer, BusinessInfoCreateUpdateSerializer
from core.services.subscription import can_publish_hospital


class BusinessInfoViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'public_info':
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        return BusinessInfo.objects.select_related('website_setup').filter(website_setup__user=self.request.user)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return BusinessInfoCreateUpdateSerializer
        return BusinessInfoSerializer

    def get_object(self):
        website_setup, _ = WebsiteSetup.objects.get_or_create(
            user=self.request.user,
            defaults={'subdomain': self.request.user.email.split('@')[0]}
        )
        business_info, created = BusinessInfo.objects.get_or_create(website_setup=website_setup)
        return business_info

    def list(self, request, *args, **kwargs):
        business_info = self.get_object()
        serializer = self.get_serializer(business_info, context={'request': request})
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        website_setup, _ = WebsiteSetup.objects.get_or_create(
            user=request.user,
            defaults={'subdomain': request.user.email.split('@')[0]}
        )
        if BusinessInfo.objects.filter(website_setup=website_setup).exists():
            return Response(
                {'error': 'Business info already exists. Use update endpoint.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(website_setup=website_setup)
        business_info = BusinessInfo.objects.get(website_setup=website_setup)
        response_serializer = BusinessInfoSerializer(business_info, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        business_info = self.get_object()
        serializer = self.get_serializer(business_info, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        response_serializer = BusinessInfoSerializer(business_info, context={'request': request})
        return Response(response_serializer.data)

    def partial_update(self, request, *args, **kwargs):
        # Handle PATCH requests to /business-info/ (without ID)
        # This is called by the frontend
        business_info = self.get_object()
        serializer = self.get_serializer(business_info, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        response_serializer = BusinessInfoSerializer(business_info, context={'request': request})
        return Response(response_serializer.data)

    @action(detail=False, methods=['post'])
    def publish(self, request):
        """
        Publish the hospital website.
        Requires an active subscription OR a valid one-time payment.
        Returns HTTP 402 with code SUBSCRIPTION_REQUIRED if access is denied.
        """
        website_setup, _ = WebsiteSetup.objects.get_or_create(
            user=request.user,
            defaults={'subdomain': request.user.email.split('@')[0]}
        )

        if not can_publish_hospital(website_setup):
            return Response(
                {
                    'detail': (
                        'You need an active subscription or purchased plan to publish your '
                        'hospital website. Please upgrade your plan to continue.'
                    ),
                    'code': 'SUBSCRIPTION_REQUIRED',
                },
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        business_info = self.get_object()
        business_info.is_published = True
        business_info.save()
        
        # Also mark the hospital profile as published if it exists
        if hasattr(website_setup, 'hospital_profile'):
            website_setup.hospital_profile.is_published = True
            website_setup.hospital_profile.save()
            
        serializer = self.get_serializer(business_info, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny], url_path='public_info')
    def public_info(self, request):
        """
        Public endpoint to get basic info for a subdomain without authentication.
        GET /api/business-info/public_info/?subdomain=...
        """
        subdomain = request.query_params.get('subdomain')
        if not subdomain:
            return Response({'error': 'subdomain is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            website_setup = WebsiteSetup.objects.select_related('user').get(subdomain__iexact=subdomain)
        except WebsiteSetup.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
            
        is_published = False
        template_id = None
        
        if website_setup.user.business_type == 'pharmacy':
            try:
                profile = website_setup.pharmacy_profile
                is_published = profile.is_published
                template_id = profile.template_id
            except Exception:
                pass
        else:
            template_id = website_setup.template_id
            try:
                is_published = website_setup.hospital_profile.is_published
            except Exception:
                pass

        return Response({
            'business_type': website_setup.user.business_type,
            'owner_id': str(website_setup.user.id),
            'template_id': template_id,
            'is_published': is_published,
        })
