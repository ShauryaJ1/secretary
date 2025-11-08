#!/usr/bin/env python3
"""
Test script to fetch emails and see the actual response structure
"""
import requests
import json
import sys

BACKEND_URL = "http://localhost:3001"

def test_fetch_emails(user_id: str, limit: int = 5):
    """Test fetching emails for a user"""
    url = f"{BACKEND_URL}/actions/fetch_emails"
    payload = {
        "user_id": user_id,
        "limit": limit
    }
    
    print(f"Testing email fetch for user: {user_id}")
    print(f"Request URL: {url}")
    print(f"Request payload: {json.dumps(payload, indent=2)}")
    print("-" * 50)
    
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print("-" * 50)
        
        if response.status_code == 200:
            data = response.json()
            print("SUCCESS! Email data structure:")
            print(json.dumps(data, indent=2))
            
            emails = data.get("emails", [])
            print(f"\nNumber of emails: {len(emails)}")
            
            if emails:
                print("\nFirst email structure:")
                print(json.dumps(emails[0], indent=2))
        else:
            print(f"ERROR: {response.status_code}")
            try:
                error_data = response.json()
                print("Error response:")
                print(json.dumps(error_data, indent=2))
            except:
                print("Error response (text):")
                print(response.text)
                
    except Exception as e:
        print(f"Exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_email_fetch.py <user_email> [limit]")
        print("Example: python test_email_fetch.py user@example.com 5")
        sys.exit(1)
    
    user_id = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    
    test_fetch_emails(user_id, limit)

