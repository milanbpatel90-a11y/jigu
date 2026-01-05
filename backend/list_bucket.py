import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.eu-west-1.wasabisys.com',
    region_name='eu-west-1',
    aws_access_key_id='CIRUITZOGBCJ0JVNF24E',
    aws_secret_access_key='q7yMsemeGeQ70P4DYzXrmFeuUjb5ms62bucg28ec'
)

BUCKET = 'jigu'

try:
    response = s3.list_objects_v2(Bucket=BUCKET)
    
    if 'Contents' not in response:
        print("Bucket is empty")
    else:
        print(f"Found {len(response['Contents'])} objects:\n")
        for obj in response['Contents']:
            print(f"  {obj['Key']} ({obj['Size']} bytes)")
except Exception as e:
    print(f"Error: {e}")
