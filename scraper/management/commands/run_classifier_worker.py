import time
from django.core.management.base import BaseCommand
from scraper.models import ClassificationTask
from scraper.classification_service import ToxicityClassifierService

class Command(BaseCommand):
    help = 'Runs the continuous background task worker for comment classification.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting classification worker...'))

        # Only initialize the AI model when the worker starts up
        classifier_service = ToxicityClassifierService()
        self.stdout.write(self.style.SUCCESS('Classifier service ready.'))

        while True:
            # Reconnect DB if connections are stale? Django usually handles this.
            
            # Fetch a pending task
            task = ClassificationTask.objects.filter(status='Pending').order_by('created_at').first()

            if task:
                self.stdout.write(self.style.NOTICE(f'Found pending task: {task}'))
                
                # Mark as In Progress
                task.status = 'InProgress'
                task.save(update_fields=['status'])

                try:
                    # Run the classification
                    classifier_service.classify_video_comments(task.video_id, task=task)
                    self.stdout.write(self.style.SUCCESS(f'Task completed: {task}'))
                    
                except Exception as e:
                    self.stderr.write(self.style.ERROR(f'Task failed: {task}. Error: {e}'))
                    task.status = 'Failed'
                    task.error_message = str(e)
                    task.save(update_fields=['status', 'error_message'])
            else:
                # No tasks, wait before checking again
                time.sleep(5)
