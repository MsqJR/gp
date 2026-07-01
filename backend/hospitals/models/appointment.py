from django.db import models
from core.models import WebsiteSetup
from .doctor import Doctor
import uuid


class Appointment(models.Model):
    """Patient appointment."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_appointments'
    )
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    patient_name = models.CharField(max_length=255)
    patient_email = models.EmailField()
    patient_phone = models.CharField(max_length=50)
    patient_gender = models.CharField(max_length=20, blank=True, null=True)
    patient_age = models.PositiveIntegerField(blank=True, null=True)

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    review_email_sent = models.BooleanField(default=False)
    confirmation_email_sent = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_appointments'
        # Prevent double booking at the database level for a doctor's exact slot start
        unique_together = ('doctor', 'start_datetime')
        indexes = [
            models.Index(fields=['doctor', 'start_datetime']),
        ]

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        old_status = None
        if not is_new and self.pk:
            try:
                old_status = Appointment.objects.filter(pk=self.pk).values_list('status', flat=True).first()
            except Exception:
                pass

        super().save(*args, **kwargs)

        # Trigger review email if status is changed to CONFIRMED
        if (
            self.status == Appointment.Status.CONFIRMED
            and (is_new or old_status != Appointment.Status.CONFIRMED)
            and not self.review_email_sent
        ):
            from hospitals.tasks import send_individual_review_email
            from django.db import transaction
            transaction.on_commit(lambda: send_individual_review_email(self.id))

        # Trigger confirmation email if status is changed to CONFIRMED
        if (
            self.status == Appointment.Status.CONFIRMED
            and (is_new or old_status != Appointment.Status.CONFIRMED)
            and not self.confirmation_email_sent
        ):
            from hospitals.tasks import send_appointment_confirmation_email
            from django.db import transaction
            transaction.on_commit(lambda: send_appointment_confirmation_email(self.id))



    def __str__(self):
        return f"Appointment for {self.patient_name} with {self.doctor.name} at {self.start_datetime}"

