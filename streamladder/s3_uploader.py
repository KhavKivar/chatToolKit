import os
import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

class S3Uploader:
    def __init__(self):
        self.access_key = os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("AWS_STORAGE_BUCKET_NAME")
        self.region = os.getenv("AWS_S3_REGION_NAME", "us-east-1")

        if not all([self.access_key, self.secret_key, self.bucket_name]):
            logger.warning("AWS credentials or bucket name missing in .env")
            self.s3_client = None
        else:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region
            )

    def upload_file(self, file_path, object_name=None):
        if not self.s3_client:
            logger.error("S3 client not initialized.")
            return None

        if object_name is None:
            object_name = os.path.basename(file_path)

        try:
            logger.info(f"Uploading {file_path} to S3 bucket {self.bucket_name}...")
            self.s3_client.upload_file(
                file_path, 
                self.bucket_name, 
                object_name,
                ExtraArgs={
                    'ContentType': 'video/mp4',
                    'ACL': 'public-read'
                }
            )
            
            # Generate URL (assuming public read if it's for the website, 
            # otherwise we might need signed URLs, but for a simple web app public is easier)
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{object_name}"
            logger.success(f"Upload successful: {url}")
            return url
        except FileNotFoundError:
            logger.error(f"The file {file_path} was not found")
            return None
        except NoCredentialsError:
            logger.error("Credentials not available")
            return None
        except ClientError as e:
            logger.error(f"Client error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return None
