"""Test AWS credentials and Bedrock access for SafeReport.

Run with:
  safereport/.venv/Scripts/python.exe safereport/test_aws.py
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOTENV = HERE / ".env"

if not DOTENV.exists():
    print("[-] safereport/.env not found.")
    print("    Please create safereport/.env (from .env.example) and fill in your AWS credentials.")
    sys.exit(1)

# Load .env
for line in DOTENV.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        if v.strip():
            os.environ[k.strip()] = v.strip().strip('"')

region = os.environ.get("AWS_REGION", "us-east-1")
access_key = os.environ.get("AWS_ACCESS_KEY_ID")
secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
session_token = os.environ.get("AWS_SESSION_TOKEN")

if not access_key or not secret_key:
    print("[-] AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing in safereport/.env")
    sys.exit(1)

print(f"[+] Found credentials for region: {region}")
if session_token:
    print(f"[+] Found session token ({len(session_token)} chars)")

import boto3

# 1. Test STS Caller Identity
try:
    sts = boto3.client(
        "sts",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token,
    )
    ident = sts.get_caller_identity()
    print(f"[+] AWS STS Auth Successful! Account: {ident['Account']}, Arn: {ident['Arn']}")
except Exception as e:
    print(f"[-] STS verification failed: {e}")
    sys.exit(1)

# 2. Test Bedrock List Foundation Models
try:
    bedrock = boto3.client(
        "bedrock",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token,
    )
    models = bedrock.list_foundation_models(byOutputModality="TEXT")
    claude_models = [
        m["modelId"] for m in models.get("modelSummaries", [])
        if "anthropic" in m["modelId"] or "claude" in m["modelId"]
    ]
    all_models = [m["modelId"] for m in models.get("modelSummaries", [])]
    print(f"[+] Bedrock accessible! Total text models: {len(all_models)}")
    if claude_models:
        print("[+] Available Claude models in this region:")
        for cm in claude_models:
            print(f"    - {cm}")
    else:
        print("[*] No Claude models found; other available models (first 5):")
        for m in all_models[:5]:
            print(f"    - {m}")
except Exception as e:
    print(f"[-] Bedrock list_foundation_models check failed: {e}")

# 3. Test Textract (if allowed)
try:
    textract = boto3.client(
        "textract",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token,
    )
    # Check if textract client is initialized
    print("[+] Amazon Textract client initialized.")
except Exception as e:
    print(f"[*] Amazon Textract client issue: {e}")
