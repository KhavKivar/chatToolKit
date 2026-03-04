import requests
import json

API_BASE_URL = "https://backend.permisossubtel.cl/api"
VIDEOS_URL = f"{API_BASE_URL}/videos/"
STREAMER_LOGIN = "shigity"

def get_all_vods():
    vods, url = [], VIDEOS_URL
    while url:
        try:
            resp = requests.get(url, params={"streamer_login": STREAMER_LOGIN}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"Error fetching VODs: {e}")
            break
        
        if isinstance(data, list):
            vods.extend(data)
            break
        vods.extend(data.get("results", []))
        url = data.get("next")
    return vods

def main():
    print(f"Buscando VODs de '{STREAMER_LOGIN}' sin transcripción...")
    vods = get_all_vods()
    
    # Filtrar solo los que NO tienen transcript
    missing_transcripts = [v['id'] for v in vods if not v.get('has_transcript')]
    
    print(f"\nSe encontraron {len(missing_transcripts)} VODs sin transcripción para {STREAMER_LOGIN}:")
    print(json.dumps(missing_transcripts))
    
    # Formato para Colab (lista de strings)
    colab_list = ", ".join([f"'{vid}'" for vid in missing_transcripts])
    print(f"\nCopia esto para tu Colab:")
    print(f"VOD_IDS = [{colab_list}]")

if __name__ == "__main__":
    main()
