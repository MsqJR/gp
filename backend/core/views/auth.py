import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, logout as django_logout
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import WebsiteSetup
from core.serializers import (
    DeleteAccountSerializer,
    ForgotPasswordSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetTokenValidationSerializer,
    SignupSerializer,
    UserSerializer,
)


logger = logging.getLogger(__name__)
PASSWORD_RESET_GENERIC_RESPONSE = 'If an account exists for this email, a password reset link has been sent.'


def _build_password_reset_url(uid: str, token: str) -> str:
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    reset_path = getattr(settings, 'FRONTEND_PASSWORD_RESET_PATH', '/reset-password')
    if not reset_path.startswith('/'):
        reset_path = f'/{reset_path}'
    return f'{frontend_url}{reset_path}?uid={uid}&token={token}'


def _get_user_from_uid(uid: str):
    user_model = get_user_model()
    try:
        decoded_uid = force_str(urlsafe_base64_decode(uid))
        return user_model.objects.get(pk=decoded_uid, is_active=True)
    except (TypeError, ValueError, OverflowError, user_model.DoesNotExist):
        return None


def _blacklist_all_tokens_for_user(user):
    for outstanding_token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding_token)


def _blacklist_single_refresh_token(refresh_token: str, user):
    try:
        token = RefreshToken(refresh_token)
    except TokenError:
        return False, 'Invalid or expired refresh token.'

    if str(token.get('user_id')) != str(user.pk):
        return False, 'Refresh token does not belong to the authenticated user.'

    try:
        token.blacklist()
    except TokenError as exc:
        if 'blacklisted' in str(exc).lower():
            return True, None
        return False, 'Invalid or expired refresh token.'

    return True, None


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def api_root(request):
    return Response({
        'message': 'Medify Backend API',
        'version': '1.0.0',
        'endpoints': {
            'authentication': {
                'signup': '/api/auth/signup/',
                'login': '/api/auth/login/',
                'logout': '/api/auth/logout/',
                'delete_account': '/api/auth/delete-account/',
                'me': '/api/auth/me/',
                'refresh': '/api/auth/refresh/',
                'forgot_password': '/api/auth/forgot-password/',
                'reset_password_validate': '/api/auth/password-reset/validate/',
                'reset_password_confirm': '/api/auth/password-reset/confirm/',
            },
            'website_setup': '/api/website-setups/',
            'business_info': '/api/business-info/',
            'admin': '/admin/',
        },
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def signup(request):
    serializer = SignupSerializer(data=request.data)
    if serializer.is_valid():
        try:
            with transaction.atomic():
                user = serializer.save()
                
                # Ensure unique subdomain
                base_subdomain = user.email.split('@')[0]
                subdomain = base_subdomain
                counter = 1
                while WebsiteSetup.objects.filter(subdomain__iexact=subdomain).exists():
                    subdomain = f"{base_subdomain}{counter}"
                    counter += 1
                    
                website_setup = WebsiteSetup.objects.create(user=user, subdomain=subdomain)
                
                # If it's a hospital, create the hospital profile
                if user.business_type == 'hospital':
                    from hospitals.models.profile import HospitalProfile
                    from hospitals.services.template_service import generate_default_hospital_template
                    profile = HospitalProfile.objects.create(
                        website_setup=website_setup,
                        name=f"{user.name}'s Hospital"
                    )
                    generate_default_hospital_template(website_setup)
                    
                refresh = RefreshToken.for_user(user)
                return Response({
                    'user': UserSerializer(user, context={'request': request}).data,
                    'tokens': {
                        'refresh': str(refresh),
                        'access': str(refresh.access_token),
                    },
                    'website_setup_id': str(website_setup.id),
                }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception("Signup error")
            return Response({'non_field_errors': [str(e)]}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login(request):
    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        return Response({'error': 'Email and password are required'}, status=status.HTTP_400_BAD_REQUEST)
    user = authenticate(request, username=email, password=password)
    if user is None:
        return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user, context={'request': request}).data,
        'tokens': {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        },
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_current_user(request):
    return Response(UserSerializer(request.user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def logout(request):
    serializer = LogoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    refresh_token = serializer.validated_data.get('refresh')
    all_devices = serializer.validated_data.get('all_devices', False)

    if all_devices:
        _blacklist_all_tokens_for_user(request.user)

    if refresh_token:
        is_valid, error_message = _blacklist_single_refresh_token(refresh_token, request.user)
        if not is_valid:
            return Response({'error': error_message}, status=status.HTTP_400_BAD_REQUEST)

    django_logout(request)
    return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def delete_account(request):
    serializer = DeleteAccountSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)

    user = request.user
    with transaction.atomic():
        _blacklist_all_tokens_for_user(user)
        django_logout(request)
        user.delete()

    return Response({'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def forgot_password(request):
    serializer = ForgotPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data['email'].strip().lower()
    user_model = get_user_model()
    user = user_model.objects.filter(email__iexact=email, is_active=True).first()

    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = _build_password_reset_url(uid, token)
        email_subject = 'Reset your Medify password'
        email_body = (
            'We received a request to reset your Medify account password.\n\n'
            f'Reset link: {reset_url}\n\n'
            'If you did not request this, you can safely ignore this email.'
        )

        try:
            send_mail(
                subject=email_subject,
                message=email_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception:
            logger.exception('Failed to send password reset email for user %s', user.pk)

    return Response({'message': PASSWORD_RESET_GENERIC_RESPONSE}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def validate_password_reset_token(request):
    serializer = PasswordResetTokenValidationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    uid = serializer.validated_data['uid']
    token = serializer.validated_data['token']
    user = _get_user_from_uid(uid)

    if not user or not default_token_generator.check_token(user, token):
        return Response(
            {'valid': False, 'error': 'Reset link is invalid or has expired.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({'valid': True}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def reset_password(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    uid = serializer.validated_data['uid']
    token = serializer.validated_data['token']
    user = _get_user_from_uid(uid)

    if not user or not default_token_generator.check_token(user, token):
        return Response({'error': 'Reset link is invalid or has expired.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(serializer.validated_data['password'])
    user.save(update_fields=['password'])
    _blacklist_all_tokens_for_user(user)

    return Response(
        {'message': 'Password reset successful. You can now log in with your new password.'},
        status=status.HTTP_200_OK,
    )


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(required=True)


class OnboardingSerializer(serializers.Serializer):
    business_type = serializers.ChoiceField(choices=['hospital', 'pharmacy'])
    subdomain = serializers.CharField(max_length=255)
    business_name = serializers.CharField(max_length=255)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def google_login(request):
    serializer = GoogleLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'error': 'id_token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    id_token = serializer.validated_data['id_token']
    client_id = getattr(settings, 'GOOGLE_OAUTH2_CLIENT_ID', None)

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        id_info = google_id_token.verify_oauth2_token(id_token, google_requests.Request(), client_id)
    except Exception:
        return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)

    email = id_info.get('email', '')
    name = id_info.get('name', '')
    google_sub = id_info.get('sub', '')

    if not email:
        return Response({'error': 'Email not provided by Google.'}, status=status.HTTP_400_BAD_REQUEST)

    user_model = get_user_model()
    user = user_model.objects.filter(google_oauth_id=google_sub).first()

    if not user:
        user = user_model.objects.filter(email__iexact=email).first()
        if user:
            user.google_oauth_id = google_sub
            user.save(update_fields=['google_oauth_id', 'updated_at'])
        else:
            username = email.split('@')[0]
            base_username = username
            counter = 1
            while user_model.objects.filter(username=username).exists():
                username = f"{base_username}{counter}"
                counter += 1

            user = user_model.objects.create_user(
                username=username,
                email=email,
                name=name or email.split('@')[0],
                google_oauth_id=google_sub,
                is_onboarding_completed=False,
                business_type='',
            )

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user, context={'request': request}).data,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def onboarding(request):
    serializer = OnboardingSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    business_type = serializer.validated_data['business_type']
    subdomain = serializer.validated_data['subdomain']
    business_name = serializer.validated_data['business_name']

    if WebsiteSetup.objects.filter(subdomain__iexact=subdomain).exclude(user=request.user).exists():
        return Response({'error': 'Subdomain is already taken'}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    user.business_type = business_type
    user.is_onboarding_completed = True
    user.save(update_fields=['business_type', 'is_onboarding_completed', 'updated_at'])

    website_setup, created = WebsiteSetup.objects.get_or_create(
        user=user,
        defaults={'subdomain': subdomain},
    )
    if not created:
        website_setup.subdomain = subdomain
        website_setup.save(update_fields=['subdomain', 'updated_at'])

    if business_type == 'hospital':
        from hospitals.models.profile import HospitalProfile
        from hospitals.services.template_service import generate_default_hospital_template
        HospitalProfile.objects.get_or_create(
            website_setup=website_setup,
            defaults={'name': business_name},
        )
        generate_default_hospital_template(website_setup)

    return Response({
        'status': 'success',
        'message': 'Onboarding completed successfully.',
        'website_setup_id': str(website_setup.id),
    })
