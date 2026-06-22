from django.db import models
from core.models import WebsiteSetup
from .pharmacy import Pharmacy
import uuid


class Product(models.Model):
    """Pharmacy product model"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pharmacy = models.ForeignKey(
        Pharmacy,
        on_delete=models.CASCADE,
        related_name='products',
        null=True,
        blank=True,
    )
    website_setup = models.ForeignKey(WebsiteSetup, on_delete=models.CASCADE, related_name='products')
    name          = models.CharField(max_length=255)
    category      = models.CharField(max_length=100)
    description   = models.TextField(blank=True)
    image         = models.ImageField(upload_to='product_images/', null=True, blank=True)
    image_url     = models.URLField(blank=True)
    price         = models.DecimalField(max_digits=10, decimal_places=2)
    stock         = models.PositiveIntegerField(default=0, help_text="Quantity available in stock")
    in_stock      = models.BooleanField(default=True)  # Keep for backward compatibility
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Auto-update in_stock based on stock quantity
        self.in_stock = self.stock > 0
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'api_product'
        ordering = ['-created_at']
