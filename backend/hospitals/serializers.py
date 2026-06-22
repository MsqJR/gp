from rest_framework import serializers
from .models import HospitalProfile, Department, Doctor, DoctorSchedule, Appointment, Page, Block


class HospitalProfileSerializer(serializers.ModelSerializer):
    subdomain = serializers.SerializerMethodField()
    business_info = serializers.SerializerMethodField()

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
            }
        except Exception:
            return {}

    class Meta:
        model = HospitalProfile
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class DepartmentSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = Doctor
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'created_at', 'updated_at')


class AppointmentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ('id', 'website_setup', 'status', 'created_at', 'updated_at')


class AppointmentAdminSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)

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
