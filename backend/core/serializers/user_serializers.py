from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from core.models import User


ACCOUNT_DELETE_CONFIRMATION_TEXT = 'DELETE'


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'business_type', 'google_oauth_id', 'is_onboarding_completed', 'created_at']
        read_only_fields = ['id', 'created_at']


class SignupSerializer(serializers.ModelSerializer):
    """Serializer for user registration"""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password_confirm', 'name', 'business_type']
        extra_kwargs = {
            'email': {'required': True},
            'name': {'required': True},
            'business_type': {'required': True},
        }

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            username=validated_data['email'],  # Use email as username
            email=validated_data['email'],
            password=validated_data['password'],
            name=validated_data['name'],
            business_type=validated_data['business_type'],
        )
        return user


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False)
    all_devices = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get('all_devices') and not attrs.get('refresh'):
            raise serializers.ValidationError({
                'refresh': 'Refresh token is required unless logging out all devices.',
            })
        return attrs


class DeleteAccountSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True, trim_whitespace=False)
    confirmation_text = serializers.CharField(required=True)

    def validate_confirmation_text(self, value):
        if value.strip().upper() != ACCOUNT_DELETE_CONFIRMATION_TEXT:
            raise serializers.ValidationError(
                f'Confirmation text must be {ACCOUNT_DELETE_CONFIRMATION_TEXT}.',
            )
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if not user or not user.is_authenticated:
            raise serializers.ValidationError('Authentication required.')

        if attrs['email'].strip().lower() != user.email.lower():
            raise serializers.ValidationError({'email': 'Email confirmation does not match current account.'})

        if not user.check_password(attrs['password']):
            raise serializers.ValidationError({'password': 'Incorrect password.'})

        return attrs


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class PasswordResetTokenValidationSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        trim_whitespace=False,
        validators=[validate_password],
    )
    password_confirm = serializers.CharField(write_only=True, required=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password': "Password fields didn't match."})
        return attrs
