from django.db import models
from core.models import WebsiteSetup
import uuid


class Page(models.Model):
    """A page within the hospital website."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_pages'
    )
    title        = models.CharField(max_length=255)
    slug         = models.SlugField(max_length=255)
    is_published = models.BooleanField(default=True)
    is_home      = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table        = 'hospital_builder_pages'
        unique_together = ('website_setup', 'slug')

    def __str__(self):
        return f"{self.title} ({self.slug})"


class Block(models.Model):
    """A block on a page."""

    class BlockType(models.TextChoices):
        HERO_BLOCK           = 'HERO_BLOCK', 'Hero Block'
        DOCTORS_LIST_BLOCK   = 'DOCTORS_LIST_BLOCK', 'Doctors List Block'
        DEPARTMENTS_BLOCK    = 'DEPARTMENTS_BLOCK', 'Departments Block'
        BOOKING_BUTTON_BLOCK = 'BOOKING_BUTTON_BLOCK', 'Booking Button Block'
        BOOKING_FORM_BLOCK   = 'BOOKING_FORM_BLOCK', 'Booking Form Block'
        TEXT_BLOCK           = 'TEXT_BLOCK', 'Text Block'
        IMAGE_BLOCK          = 'IMAGE_BLOCK', 'Image Block'
        CONTACT_BLOCK        = 'CONTACT_BLOCK', 'Contact Block'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='blocks'
    )
    type = models.CharField(
        max_length=50,
        choices=BlockType.choices
    )
    order = models.IntegerField(default=0)
    settings = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_builder_blocks'
        ordering = ['order']

    def __str__(self):
        return f"{self.get_type_display()} on {self.page.title}"
