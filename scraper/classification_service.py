import time
from transformers import pipeline
from django.db import transaction
from scraper.models import Comment, ClassificationTask

class ToxicityClassifierService:
    def __init__(self, model_name="cardiffnlp/twitter-roberta-base-offensive"):
        print(f"Loading toxicity model: {model_name}...")
        self.classifier = pipeline("text-classification", model=model_name, truncation=True, max_length=512)
        print("Model loaded successfully.")

    def classify_video_comments(self, video_id, task=None):
        print(f"Starting classification for video: {video_id}")
        
        # Get all comments that haven't been scored yet
        comments = Comment.objects.filter(video_id=video_id, toxicity_score__isnull=True)
        total_comments = comments.count()
        
        if total_comments == 0:
            print(f"No unscored comments found for video {video_id}.")
            if task:
                task.progress_percent = 100
                task.status = 'Completed'
                task.save()
            return

        batch_size = 100
        processed = 0

        # We need to evaluate the comments into lists
        # But we must only fetch what's needed for the batch since texts might be large
        
        for i in range(0, total_comments, batch_size):
            # Evaluate queryset batch locally
            batch = list(comments[i:i+batch_size])
            texts = [str(c.message) if c.message else "" for c in batch]
            
            try:
                results = self.classifier(texts)
                
                with transaction.atomic():
                    for obj, res in zip(batch, results):
                        obj.toxicity_score = res['score']
                        # Depending on the model, label is 'LABEL_1' (offensive) or 'LABEL_0' (not-offensive)
                        # Or 'LABEL_0' might be offensive. For cardiffnlp: LABEL_0 is neutral, LABEL_1 is positive, etc?
                        # Actually for cardiffnlp/twitter-roberta-base-offensive,LABEL_1 is offensive
                        label = res['label'].lower()
                        obj.is_toxic = 'label_1' in label or 'offensive' in label
                        obj.save(update_fields=['is_toxic', 'toxicity_score'])
                
                processed += len(batch)
                
                if task:
                    task.progress_percent = int((processed / total_comments) * 100)
                    task.save(update_fields=['progress_percent', 'updated_at'])
                    
                print(f"Classified {processed}/{total_comments} comments.")
                
            except Exception as e:
                print(f"Error during batch classification: {e}")
                if task:
                    task.status = 'Failed'
                    task.error_message = str(e)
                    task.save()
                return

        if task:
            task.progress_percent = 100
            task.status = 'Completed'
            task.save()
            
        print(f"Finished classification for video {video_id}.")
