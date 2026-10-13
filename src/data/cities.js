// Starter city list for India, Southeast Asia and the diaspora. Production:
// replace with a geocoding API or the full GeoNames cities15000 dataset.
export const CITIES = [
  ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'], ['Delhi', 28.6139, 77.209, 'Asia/Kolkata'],
  ['Bengaluru', 12.9716, 77.5946, 'Asia/Kolkata'], ['Hyderabad', 17.385, 78.4867, 'Asia/Kolkata'],
  ['Ahmedabad', 23.0225, 72.5714, 'Asia/Kolkata'], ['Chennai', 13.0827, 80.2707, 'Asia/Kolkata'],
  ['Kolkata', 22.5726, 88.3639, 'Asia/Kolkata'], ['Surat', 21.1702, 72.8311, 'Asia/Kolkata'],
  ['Pune', 18.5204, 73.8567, 'Asia/Kolkata'], ['Jaipur', 26.9124, 75.7873, 'Asia/Kolkata'],
  ['Lucknow', 26.8467, 80.9462, 'Asia/Kolkata'], ['Vadodara', 22.3072, 73.1812, 'Asia/Kolkata'],
  ['Rajkot', 22.3039, 70.8022, 'Asia/Kolkata'], ['Indore', 22.7196, 75.8577, 'Asia/Kolkata'],
  ['Bhopal', 23.2599, 77.4126, 'Asia/Kolkata'], ['Patna', 25.5941, 85.1376, 'Asia/Kolkata'],
  ['Varanasi', 25.3176, 82.9739, 'Asia/Kolkata'], ['Nagpur', 21.1458, 79.0882, 'Asia/Kolkata'],
  ['Kochi', 9.9312, 76.2673, 'Asia/Kolkata'], ['Chandigarh', 30.7333, 76.7794, 'Asia/Kolkata'],
  ['Kathmandu', 27.7172, 85.324, 'Asia/Kathmandu'], ['Colombo', 6.9271, 79.8612, 'Asia/Colombo'],
  ['Dhaka', 23.8103, 90.4125, 'Asia/Dhaka'], ['Bangkok', 13.7563, 100.5018, 'Asia/Bangkok'],
  ['Chiang Mai', 18.7883, 98.9853, 'Asia/Bangkok'], ['Ho Chi Minh City', 10.8231, 106.6297, 'Asia/Ho_Chi_Minh'],
  ['Hanoi', 21.0278, 105.8342, 'Asia/Ho_Chi_Minh'], ['Singapore', 1.3521, 103.8198, 'Asia/Singapore'],
  ['Kuala Lumpur', 3.139, 101.6869, 'Asia/Kuala_Lumpur'], ['Jakarta', -6.2088, 106.8456, 'Asia/Jakarta'],
  ['Bali (Denpasar)', -8.6705, 115.2126, 'Asia/Makassar'], ['Manila', 14.5995, 120.9842, 'Asia/Manila'],
  ['Cebu', 10.3157, 123.8854, 'Asia/Manila'], ['Phnom Penh', 11.5564, 104.9282, 'Asia/Phnom_Penh'],
  ['Yangon', 16.8409, 96.1735, 'Asia/Yangon'], ['Dubai', 25.2048, 55.2708, 'Asia/Dubai'],
  ['London', 51.5072, -0.1276, 'Europe/London'], ['New York', 40.7128, -74.006, 'America/New_York'],
  ['Toronto', 43.6532, -79.3832, 'America/Toronto'], ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
].map(([name, lat, lon, tz]) => ({ name, lat, lon, tz }));
