-- sliding_window_rate_limiter.lua
-- KEYS[1]: The sliding window key for the agent (e.g., rate:agent_123:fee_waivers)
-- ARGV[1]: Current timestamp in milliseconds
-- ARGV[2]: Window size in milliseconds (e.g., 60000 for 1 minute)
-- ARGV[3]: Maximum amount allowed in the window (e.g., 50.00)
-- ARGV[4]: The requested amount to add (e.g., 10.00)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_amount = tonumber(ARGV[3])
local request_amount = tonumber(ARGV[4])

local clear_before = now - window

-- Remove old entries outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

-- Sum up the amounts of all remaining elements in the window
-- In a sorted set, we can store the amount in the member string if it's unique,
-- so we append a random/timestamp suffix to keep it unique: "amount_timestamp"
local elements = redis.call('ZRANGE', key, 0, -1)
local current_sum = 0
for i, member in ipairs(elements) do
    -- Extract the amount before the underscore (e.g., "10.5_1700000000" -> 10.5)
    local separator = string.find(member, "_")
    if separator then
        local amt = tonumber(string.sub(member, 1, separator - 1))
        if amt then
            current_sum = current_sum + amt
        end
    end
end

if (current_sum + request_amount) > max_amount then
    return 0 -- Denied
else
    -- Add the new request to the sorted set
    local unique_member = tostring(request_amount) .. "_" .. tostring(now)
    redis.call('ZADD', key, now, unique_member)
    -- Set TTL on the key to automatically expire after the window size
    redis.call('PEXPIRE', key, window)
    return 1 -- Allowed
end
