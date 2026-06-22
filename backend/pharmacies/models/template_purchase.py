from django.db import models
import uuid

from core.models import WebsiteSetup

from .pharmacy import Pharmacy


class PharmacyTemplatePurchase(models.Model):
    """Stores one persistent purchase record per pharmacy/template pair."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        CANCELLED = 'cancelled', 'Cancelled'

    class PaymentMethod(models.TextChoices):
        VISA = 'visa', 'Visa/Mastercard'
        FAWRY = 'fawry', 'Fawry'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pharmacy = models.ForeignKey(
        Pharmacy,
        on_delete=models.CASCADE,
        related_name='template_purchases',
    )
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='template_purchases',
    )
    template_id     = models.PositiveIntegerField(db_index=True)
    template_name   = models.CharField(max_length=140)
    amount          = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method  = models.CharField(max_length=20, choices=PaymentMethod.choices)
    transaction_reference = models.CharField(max_length=255, blank=True)
    status       = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    purchased_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pharmacy_template_purchases'
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['pharmacy', 'template_id'],
                name='uniq_pharmacy_template_purchase',
            )
        ]

    def __str__(self):
        return f"{self.pharmacy_id}:{self.template_id} ({self.status})"
