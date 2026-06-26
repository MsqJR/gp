from rest_framework import serializers
from .models import HospitalProfile, Department, Doctor, DoctorSchedule, Appointment, Page, Block, HospitalPhoto
from core.services.subscription import get_allowed_features, PLAN_TYPE_STANDARD, PLAN_TYPE_PREMIUM


class HospitalProfileSerializer(serializers.ModelSerializer):
    subdomain = serializers.SerializerMethodField()
    business_info = serializers.SerializerMethodField()
    patients_treated = serializers.SerializerMethodField()
    allowed_features = serializers.SerializerMethodField()

    def get_subdomain(self, obj):
        return obj.website_setup.subdomain if obj.website_setup else None

    def get_business_info(self, obj):
        """Return contact/hours data from the linked BusinessInfo record."""
        try:
            bi = obj.website_setup.business_info
            return {
                'contact_phone': bi.contact_phone or '',
                'contact_email': bi.contact_email or '',
                'address': bi.address or '',
                'working_hours': bi.working_hours or {},
                'years_of_experience': bi.years_of_experience,
            }
        except Exception:
            return {}

    def get_patients_treated(self, obj):
        from hospitals.models import Appointment
        count = Appointment.objects.filter(website_setup=obj.website_setup).count()
        return str(count)

    def get_allowed_features(self, obj):
        """Return the list of allowed features based on the website setup's subscription."""
        if not obj.website_setup:
            return []
        from core.services.subscription import get_allowed_features
        access = get_allowed_features(obj.website_setup)
        return access.allowed_features

    class Meta:
        model = HospitalProfile
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')

    # ── Subscription guard ────────────────────────────────────────────────────

    _CUSTOMIZATION_FIELDS = {'theme_settings', 'logo'}
    _ALLOWED_PLANS = {PLAN_TYPE_STANDARD, PLAN_TYPE_PREMIUM}

    def validate(self, attrs):
        """
        Block writes to theme_settings or logo unless the hospital has an
        active Premium (STANDARD) plan or higher.
        """
        # Only applies on update (instance is set); skip on create
        if self.instance is None:
            return attrs

        customization_keys = self._CUSTOMIZATION_FIELDS.intersection(attrs.keys())
        if not customization_keys:
            return attrs  # Not a customization write — allow

        website_setup = getattr(self.instance, 'website_setup', None)
        if website_setup is None:
            raise serializers.ValidationError(
                'Cannot update customization: website setup not found.'
            )

        plan_access = get_allowed_features(website_setup)
        if not plan_access.is_active or plan_access.plan_type not in self._ALLOWED_PLANS:
            raise serializers.ValidationError(
                'Website customization requires an active Premium plan. '
                'Please upgrade your subscription to save theme or logo changes.'
            )

        return attrs


class DepartmentSerializer(serializers.ModelSerializer):
    doctor_count = serializers.SerializerMethodField()

    def get_doctor_count(self, obj):
        return obj.doctors.filter(is_active=True).count()

    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class DoctorScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSchedule
        fields = '__all__'
        read_only_fields = ('id', 'doctor')


class DoctorSerializer(serializers.ModelSerializer):
    schedules = DoctorScheduleSerializer(many=True, read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    image_url_resolved = serializers.SerializerMethodField()

    def get_image_url_resolved(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request is not None:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return obj.image_url or None

    def validate_department(self, value):
        request = self.context.get('request')
        if request is not None and value.website_setup.user_id != request.user.id:
            raise serializers.ValidationError('Department does not belong to your hospital.')
        return value

    class Meta:
        model = Doctor
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class AppointmentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    department_name = serializers.CharField(source='doctor.department.name', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'status', 'created_at', 'updated_at')


class AppointmentAdminSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    department_name = serializers.CharField(source='doctor.department.name', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class BlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Block
        fields = '__all__'
        read_only_fields = ('id', 'page', 'created_at', 'updated_at')


class PageSerializer(serializers.ModelSerializer):
    blocks = BlockSerializer(many=True, read_only=True)

    class Meta:
        model = Page
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class HospitalPhotoSerializer(serializers.ModelSerializer):
    """Serializer for hospital photos."""
    
    class Meta:
        model = HospitalPhoto
        fields = [
            'id', 'image', 'image_url', 'alt_text', 'caption', 
            'display_order', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def to_representation(self, instance):
        """Customize the representation to include full image URLs."""
        representation = super().to_representation(instance)
        
        # If we have an image file, provide the full URL
        if instance.image and hasattr(instance.image, 'url'):
            try:
                representation['image_url'] = self.context['request'].build_absolute_uri(instance.image.url)
            except Exception:
                # Fallback to the stored image_url if available
                if instance.image_url:
                    representation['image_url'] = instance.image_url
        elif instance.image_url:
            representation['image_url'] = instance.image_url
            
        return representation


class HospitalPhotoUpdateOrderSerializer(serializers.Serializer):
    """Serializer for bulk updating photo display order."""
    
    photo_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of photo IDs in the desired display order"
    )
    
    def validate_photo_ids(self, value):
        """Validate that all photo IDs exist and belong to the user's hospital."""
        if not value:
            raise serializers.ValidationError("Photo IDs list cannot be empty")
            
        # This validation will be completed in the view where we have access to the request user
        return value
