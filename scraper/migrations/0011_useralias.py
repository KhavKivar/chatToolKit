from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scraper', '0010_comment_commenter_display_name_idx'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserAlias',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('alias', models.CharField(max_length=255, unique=True)),
                ('canonical_name', models.CharField(max_length=255)),
            ],
        ),
    ]
