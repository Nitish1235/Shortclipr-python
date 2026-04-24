import sys
from pytubefix import YouTube

def main():
    proxy = "http://zj3ssxzve5ec:h7at9b54fymd1yv@65.111.2.163:3129"
    proxies = {"http": proxy, "https": proxy}
    url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    try:
        yt = YouTube(url, proxies=proxies, use_po_token=True)
        # vid_info is the inner tube response
        print(f"Title: {yt.title}")
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
