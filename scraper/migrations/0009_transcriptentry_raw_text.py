from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scraper', '0008_transcriptentry'),
    ]

    operations = [
        migrations.AddField(
            model_name='transcriptentry',
            name='raw_text',
            field=models.TextField(default=''),
        ),
    ]
