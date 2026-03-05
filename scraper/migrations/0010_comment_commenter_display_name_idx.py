from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scraper', '0009_transcriptentry_raw_text'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='comment',
            index=models.Index(fields=['commenter_display_name'], name='comment_display_name_idx'),
        ),
    ]
