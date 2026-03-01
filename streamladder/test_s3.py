import os
import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from dotenv import load_dotenv

# Cargar el .env de la raíz
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def test_s3_connection():
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    bucket_name = os.getenv("AWS_STORAGE_BUCKET_NAME")
    region = os.getenv("AWS_S3_REGION_NAME")

    print(f"--- S3 Connection Test ---")
    print(f"Region: {region}")
    print(f"Bucket: {bucket_name}")
    print(f"Access Key: {access_key[:5]}...{access_key[-4:] if access_key else ''}")
    
    if not all([access_key, secret_key, bucket_name]):
        print("\nERROR: Faltan variables en el .env")
        return

    try:
        # 1. Intentar inicializar el cliente
        s3 = boto3.client(
            's3',
            aws_access_key_id=access_key.strip(),
            aws_secret_access_key=secret_key.strip(),
            region_name=region
        )

        # 2. Intentar listar los objetos del bucket (Prueba de lectura/permisos)
        print(f"\nIniciando prueba de conexión...")
        s3.list_objects_v2(Bucket=bucket_name, MaxKeys=1)
        print("✅ CONEXIÓN EXITOSA: Las credenciales son válidas y el bucket existe.")

        # 3. Intentar subir un pequeño archivo de prueba
        test_file = "s3_test_file.txt"
        with open(test_file, "w") as f:
            f.write("Test upload to S3")
        
        print(f"\nIntentando subir archivo de prueba...")
        s3.upload_file(test_file, bucket_name, "test/connection_test.txt")
        print(f"✅ SUBIDA EXITOSA: El archivo se subió correctamente.")
        
        # Limpieza
        os.remove(test_file)

    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code')
        print(f"\n❌ ERROR DE AWS ({error_code}):")
        if error_code == 'SignatureDoesNotMatch':
            print("   La Secret Key es incorrecta o tiene caracteres inválidos.")
        elif error_code == 'InvalidAccessKeyId':
            print("   El Access Key ID no existe o está desactivado.")
        elif error_code == 'NoSuchBucket':
            print(f"   El bucket '{bucket_name}' no existe.")
        else:
            print(f"   {e}")
    except Exception as e:
        print(f"\n❌ ERROR INESPERADO: {e}")

if __name__ == "__main__":
    test_s3_connection()
