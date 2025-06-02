#!/usr/bin/env bash
BASE_URL="http://localhost:3000"
TOKEN="your_jwt_token_here"
VIDEO_PATH="/public/SampleVideo_1280x720_1mb.mp4"
# VIDEO_ID="123"
# CURSOR="10"

echo "1) Uploading video..."
curl -s -X POST "$BASE_URL/videos" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@${VIDEO_PATH}" \
  -F "title=My Test Upload" \
  -F "description=Uploaded via script" \
  | jq .

echo -e "\n2) Fetching feed..."
curl -s -X GET "$BASE_URL/videos?limit=5&cursor=${CURSOR}" \
  -H "Authorization: Bearer $TOKEN" \
  | jq .

# echo -e "\n3) Streaming video ${VIDEO_ID}..."
# curl -s -X GET "$BASE_URL/videos/${VIDEO_ID}/stream" \
#   -H "Authorization: Bearer $TOKEN" \
#   --output "video-${VIDEO_ID}.mp4" \
#   && echo "Saved to video-${VIDEO_ID}.mp4"

# echo -e "\n4) Liking video ${VIDEO_ID}..."
# curl -s -X POST "$BASE_URL/videos/${VIDEO_ID}/like" \
#   -H "Authorization: Bearer $TOKEN" \
#   | jq .

# echo -e "\n5) Deleting video ${VIDEO_ID}..."
# curl -s -X DELETE "$BASE_URL/videos/${VIDEO_ID}" \
#   -H "Authorization: Bearer $TOKEN" \
#   | jq .

# echo -e "\n6) Fetching thumbnail for ${VIDEO_ID}..."
# curl -s -X GET "$BASE_URL/videos/${VIDEO_ID}/thumbnail" \
#   -H "Authorization: Bearer $TOKEN" \
#   --output "thumb-${VIDEO_ID}.jpg" \
#   && echo "Saved to thumb-${VIDEO_ID}.jpg"