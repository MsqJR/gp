from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from core.views import auth, website_setup, business_info, chatbot

router = DefaultRouter()
router.register(r'website-setups', website_setup.WebsiteSetupViewSet, basename='websitesetup')

urlpatterns = [
    # Root endpoint
    path('', auth.api_root, name='api_root'),

    # Authentication
    path('auth/signup/', auth.signup, name='signup'),
    path('auth/login/', auth.login, name='login'),
    path('auth/logout/', auth.logout, name='logout'),
    path('auth/delete-account/', auth.delete_account, name='delete_account'),
    path('auth/me/', auth.get_current_user, name='get_current_user'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/google/', auth.google_login, name='google_login'),
    path('auth/onboarding/', auth.onboarding, name='onboarding'),
    path('auth/forgot-password/', auth.forgot_password, name='forgot_password'),
    path('auth/password-reset/validate/', auth.validate_password_reset_token, name='password_reset_validate'),
    path('auth/password-reset/confirm/', auth.reset_password, name='password_reset_confirm'),

    # Business Info endpoints (custom to handle PATCH without ID)
    path('business-info/', business_info.BusinessInfoViewSet.as_view({
        'get': 'list',
        'post': 'create',
        'patch': 'partial_update',
        'put': 'update'
    }), name='businessinfo-list'),
    path('business-info/<uuid:pk>/', business_info.BusinessInfoViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'put': 'update',
        'delete': 'destroy'
    }), name='businessinfo-detail'),
    path('business-info/publish/', business_info.BusinessInfoViewSet.as_view({
        'post': 'publish'
    }), name='businessinfo-publish'),

    path('chatbot/', chatbot.ChatbotAPIView.as_view(), name='chatbot'),

    # Include router URLs
    path('', include(router.urls)),
]
