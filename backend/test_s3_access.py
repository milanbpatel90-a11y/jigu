import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.eu-west-1.wasabisys.com',
    region_name='eu-west-1',
    aws_access_key_id='CIRUITZOGBCJ0JVNF24E',
    aws_secret_access_key='q7yMsemeGeQ70P4DYzXrmFeuUjb5ms62bucg28ec'
)

BUCKET = 'jigu'

# Test getting a signed URL
test_key = 'glasses (11).glb'

try:
    # Generate signed URL
    url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': BUCKET, 'Key': test_key},
        ExpiresIn=3600
    )
    print(f"Signed URL generated successfully:")
    print(url)
    print("\nTesting if object exists...")
    
    # Check if object exists
    response = s3.head_object(Bucket=BUCKET, Key=test_key)
    print(f"✓ Object exists: {test_key}")
    print(f"  Size: {response['ContentLength']} bytes")
    print(f"  Content-Type: {response.get('ContentType', 'N/A')}")
    
except Exception as e:
    print(f"Error: {e}")
