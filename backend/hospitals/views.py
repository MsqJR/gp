from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db import models
from datetime import datetime
from django.utils.dateparse import parse_date

from core.models import WebsiteSetup
from core.services.subscription import (
    get_allowed_features,
    PLAN_TYPE_STANDARD,
    PLAN_TYPE_PREMIUM,
)
from .models import HospitalProfile, Department, Doctor, DoctorSchedule, Appointment, Page, Block, HospitalPhoto
from .serializers import (
    HospitalProfileSerializer, DepartmentSerializer, DoctorSerializer,
    DoctorScheduleSerializer, AppointmentSerializer, AppointmentAdminSerializer, PageSerializer, BlockSerializer,
    HospitalPhotoSerializer, HospitalPhotoUpdateOrderSerializer
)
from .services.booking_engine import get_available_slots
from .services.template_service import generate_default_hospital_template


def _get_or_create_website_setup(user):
    website_setup, _ = WebsiteSetup.objects.get_or_create(
        user=user,
        defaults={'subdomain': f"{user.email.split('@')[0]}-hospital" if user.email else "my-hospital"}
    )
    return website_setup


# Admin APIs
class HospitalProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = HospitalProfileSerializer

    def get_queryset(self):
        return HospitalProfile.objects.filter(website_setup__user=self.request.user)

    @action(detail=False, methods=['get', 'post', 'patch', 'put'])
    def profile(self, request):
        website_setup = _get_or_create_website_setup(request.user)
        profile, created = HospitalProfile.objects.get_or_create(
            website_setup=website_setup,
            defaults={'name': 'My Hospital'}
        )

        if request.method == 'GET':
            return Response(self.get_serializer(profile).data)

        # ── Subscription guard: block customization writes without Premium plan ──
        _CUSTOMIZATION_FIELDS = {'theme_settings', 'logo'}
        _ALLOWED_PLANS = {PLAN_TYPE_STANDARD, PLAN_TYPE_PREMIUM}
        is_customization_write = bool(
            _CUSTOMIZATION_FIELDS.intersection(request.data.keys())
            or request.FILES.get('logo')
        )
        if is_customization_write:
            plan_access = get_allowed_features(website_setup)
            if not plan_access.is_active or plan_access.plan_type not in _ALLOWED_PLANS:
                return Response(
                    {
                        'detail': (
                            'Website customization requires an active Premium plan. '
                            'Please upgrade your subscription to save theme or logo changes.'
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.get_serializer(profile, data=request.data, partial=request.method in ['PATCH', 'POST'])
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Generate templates if published for the first time or if requested
        if created:
            generate_default_hospital_template(website_setup)

        return Response(self.get_serializer(profile).data)


class DepartmentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        return Department.objects.filter(website_setup__user=self.request.user)

    def perform_create(self, serializer):
        website_setup = _get_or_create_website_setup(self.request.user)
        serializer.save(website_setup=website_setup)


class DoctorViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoctorSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return (
            Doctor.objects
            .filter(website_setup__user=self.request.user)
            .select_related('department')
            .prefetch_related('schedules')
            .order_by('name')
        )

    def perform_create(self, serializer):
        website_setup = _get_or_create_website_setup(self.request.user)
        payload = {'website_setup': website_setup}
        if self.request.FILES.get('image'):
            payload['image_url'] = ''
        serializer.save(**payload)

    def perform_update(self, serializer):
        if self.request.FILES.get('image'):
            serializer.save(image_url='')
            return
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DoctorScheduleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoctorScheduleSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = DoctorSchedule.objects.filter(doctor__website_setup__user=self.request.user)
        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            queryset = queryset.filter(doctor_id=doctor_id)
        return queryset

    def perform_create(self, serializer):
        doctor_id = self.request.data.get('doctor')
        doctor = Doctor.objects.get(id=doctor_id, website_setup__user=self.request.user)
        serializer.save(doctor=doctor)


class AppointmentAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AppointmentAdminSerializer

    def get_queryset(self):
        queryset = (
            Appointment.objects
            .filter(website_setup__user=self.request.user)
            .select_related('doctor')
            .order_by('-start_datetime')
        )
        status_value = self.request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value.upper())
        return queryset

    def perform_create(self, serializer):
        doctor = serializer.validated_data['doctor']
        if doctor.website_setup.user_id != self.request.user.id:
            raise ValidationError({'doctor': 'Doctor does not belong to current user'})
        serializer.save(website_setup=doctor.website_setup)


class HospitalPhotoViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = HospitalPhotoSerializer

    def get_queryset(self):
        return HospitalPhoto.objects.filter(
            website_setup__user=self.request.user,
            is_active=True
        ).order_by('display_order', 'created_at')

    def perform_create(self, serializer):
        website_setup = _get_or_create_website_setup(self.request.user)
        
        # Auto-assign display order if not provided
        if not serializer.validated_data.get('display_order'):
            max_order = HospitalPhoto.objects.filter(
                website_setup=website_setup,
                is_active=True
            ).aggregate(max_order=models.Max('display_order'))['max_order']
            next_order = (max_order or 0) + 1
            serializer.save(website_setup=website_setup, display_order=next_order)
        else:
            serializer.save(website_setup=website_setup)

    def perform_update(self, serializer):
        # Clear image_url if new image is uploaded
        if self.request.FILES.get('image'):
            serializer.save(image_url='')
        else:
            serializer.save()

    def destroy(self, request, *args, **kwargs):
        # Soft delete by setting is_active to False
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'])
    def update_order(self, request):
        """Update the display order of multiple photos."""
        serializer = HospitalPhotoUpdateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        photo_ids = serializer.validated_data['photo_ids']
        website_setup = _get_or_create_website_setup(request.user)
        
        # Validate that all photos belong to the user
        photos = HospitalPhoto.objects.filter(
            id__in=photo_ids,
            website_setup=website_setup,
            is_active=True
        )
        
        if len(photos) != len(photo_ids):
            return Response(
                {'error': 'Some photos not found or do not belong to you'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update display order
        with transaction.atomic():
            for index, photo_id in enumerate(photo_ids):
                HospitalPhoto.objects.filter(id=photo_id).update(display_order=index + 1)
        
        # Return updated photos
        updated_photos = HospitalPhoto.objects.filter(
            website_setup=website_setup,
            is_active=True
        ).order_by('display_order', 'created_at')
        
        return Response(self.get_serializer(updated_photos, many=True).data)


# Public APIs
class PublicHospitalViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]

    def get_website_setup(self, request):
        subdomain = request.query_params.get('subdomain')
        if not subdomain:
            return None
        return WebsiteSetup.objects.filter(subdomain__iexact=subdomain).first()

    @action(detail=False, methods=['get'])
    def profile(self, request):
        website_setup = self.get_website_setup(request)
        if not website_setup:
            return Response({'error': 'subdomain required'}, status=status.HTTP_400_BAD_REQUEST)
        profile = HospitalProfile.objects.filter(website_setup=website_setup).first()
        if not profile:
            return Response({'error': 'profile not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(HospitalProfileSerializer(profile).data)

    @action(detail=False, methods=['get'])
    def pages(self, request):
        website_setup = self.get_website_setup(request)
        if not website_setup:
            return Response({'error': 'subdomain required'}, status=status.HTTP_400_BAD_REQUEST)
        pages = Page.objects.filter(website_setup=website_setup, is_published=True)
        return Response(PageSerializer(pages, many=True).data)

    @action(detail=False, methods=['get'])
    def departments(self, request):
        website_setup = self.get_website_setup(request)
        if not website_setup:
            return Response({'error': 'subdomain required'}, status=status.HTTP_400_BAD_REQUEST)
        departments = Department.objects.filter(website_setup=website_setup)
        return Response(DepartmentSerializer(departments, many=True).data)

    @action(detail=False, methods=['get'])
    def doctors(self, request):
        website_setup = self.get_website_setup(request)
        if not website_setup:
            return Response({'error': 'subdomain required'}, status=status.HTTP_400_BAD_REQUEST)
        doctors = Doctor.objects.filter(website_setup=website_setup, is_active=True)
        return Response(DoctorSerializer(doctors, many=True).data)

    @action(detail=False, methods=['get'])
    def photos(self, request):
        website_setup = self.get_website_setup(request)
        if not website_setup:
            return Response({'error': 'subdomain required'}, status=status.HTTP_400_BAD_REQUEST)
        photos = HospitalPhoto.objects.filter(
            website_setup=website_setup, 
            is_active=True
        ).order_by('display_order', 'created_at')
        return Response(HospitalPhotoSerializer(photos, many=True, context={'request': request}).data)


class BookingViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=['get'])
    def available_slots(self, request):
        doctor_id = request.query_params.get('doctor_id')
        date_str = request.query_params.get('date')

        if not doctor_id or not date_str:
            return Response({'error': 'doctor_id and date required'}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.exceptions import ValidationError
        
        try:
            doctor = Doctor.objects.get(id=doctor_id, is_active=True)
        except (Doctor.DoesNotExist, ValidationError):
            return Response({'error': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        target_date = parse_date(date_str)
        if not target_date:
            return Response({'error': 'Invalid date format (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

        slots = get_available_slots(doctor, target_date)
        return Response({'slots': slots})

    @action(detail=False, methods=['post'])
    def create_appointment(self, request):
        doctor_id = request.data.get('doctor_id')
        start_datetime_str = request.data.get('start_datetime')
        end_datetime_str = request.data.get('end_datetime')

        patient_name = request.data.get('patient_name')
        patient_email = request.data.get('patient_email')
        patient_phone = request.data.get('patient_phone')
        patient_gender = request.data.get('patient_gender')
        patient_age = request.data.get('patient_age')

        from django.core.exceptions import ValidationError

        try:
            doctor = Doctor.objects.get(id=doctor_id, is_active=True)
        except (Doctor.DoesNotExist, ValidationError):
            return Response({'error': 'Doctor not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            start_datetime = datetime.fromisoformat(start_datetime_str.replace('Z', '+00:00'))
            end_datetime = datetime.fromisoformat(end_datetime_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            return Response({'error': 'Invalid datetime format'}, status=status.HTTP_400_BAD_REQUEST)

        # Explicitly check for overlap inside an atomic transaction
        try:
            with transaction.atomic():
                # Lock rows for this doctor on this day (or check for overlap)
                overlap = Appointment.objects.filter(
                    doctor=doctor,
                    start_datetime__lt=end_datetime,
                    end_datetime__gt=start_datetime,
                    status__in=[Appointment.Status.PENDING, Appointment.Status.CONFIRMED]
                ).exists()

                if overlap:
                    return Response({'error': 'Slot is no longer available'}, status=status.HTTP_409_CONFLICT)

                appointment = Appointment.objects.create(
                    website_setup=doctor.website_setup,
                    doctor=doctor,
                    patient_name=patient_name,
                    patient_email=patient_email,
                    patient_phone=patient_phone,
                    patient_gender=patient_gender,
                    patient_age=patient_age,
                    start_datetime=start_datetime,
                    end_datetime=end_datetime,
                    status=Appointment.Status.PENDING
                )

            serializer = AppointmentSerializer(appointment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except IntegrityError:
            return Response({'error': 'Double booking prevented'}, status=status.HTTP_409_CONFLICT)
        except Exception as e:
            from django.db.utils import OperationalError
            if isinstance(e, OperationalError) and 'locked' in str(e).lower():
                return Response({'error': 'System busy, try again'}, status=status.HTTP_409_CONFLICT)
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
