from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from core.models import User, WebsiteSetup, BusinessInfo, ChatConversation, ChatMessage, TemplateAISettings


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'name', 'business_type', 'is_active', 'created_at']
    list_filter = ['business_type', 'is_active', 'created_at']
    search_fields = ['email', 'name']
    ordering = ['-created_at']

    fieldsets = BaseUserAdmin.fieldsets + (
        ('Additional Info', {'fields': ('name', 'business_type')}),
    )


@admin.register(WebsiteSetup)
class WebsiteSetupAdmin(admin.ModelAdmin):
    list_display = ['user', 'is_paid', 'total_price', 'template_id', 'created_at']
    list_filter = ['is_paid', 'created_at']
    search_fields = ['user__email', 'user__name']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(BusinessInfo)
class BusinessInfoAdmin(admin.ModelAdmin):
    list_display = ['name', 'website_setup', 'is_published', 'contact_phone', 'created_at']
    list_filter = ['is_published', 'created_at']
    search_fields = ['name', 'contact_email', 'contact_phone']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(TemplateAISettings)
class TemplateAISettingsAdmin(admin.ModelAdmin):
    list_display = ('website_setup', 'enabled', 'provider', 'model_id', 'updated_at')
    list_filter = ('enabled', 'provider')
    search_fields = ('website_setup__subdomain', 'website_setup__user__email', 'model_id')


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ('role', 'content', 'model_name', 'safety_flags', 'metadata', 'created_at')
    can_delete = False


@admin.register(ChatConversation)
class ChatConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'website_setup', 'status', 'last_risk_level', 'updated_at')
    list_filter = ('status', 'last_risk_level')
    search_fields = ('id', 'website_setup__subdomain', 'website_setup__user__email', 'visitor_id')
    readonly_fields = ('created_at', 'updated_at', 'metadata')
    inlines = [ChatMessageInline]
