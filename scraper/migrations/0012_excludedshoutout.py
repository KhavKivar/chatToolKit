from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scraper', '0011_useralias'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExcludedShoutout',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
    ]
