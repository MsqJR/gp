from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hospitals', '0008_doctor_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='doctor',
            name='title',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='doctor',
            name='experience',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
