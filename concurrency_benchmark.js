// concurrency_benchmark.js

// Mock API request that takes some time to resolve
const simulateNetworkRequest = (id, delayMs) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ id, success: true });
        }, delayMs);
    });
};

async function runUnbatched(ids, delay) {
    console.log(`Starting Unbatched approach for ${ids.length} items...`);
    let activeRequests = 0;
    let maxActive = 0;

    const startTime = Date.now();

    await Promise.all(ids.map(async (id) => {
        activeRequests++;
        if (activeRequests > maxActive) {
            maxActive = activeRequests;
        }
        await simulateNetworkRequest(id, delay);
        activeRequests--;
    }));

    const duration = Date.now() - startTime;
    return { maxActive, duration, name: "Unbatched" };
}

async function runBatched(ids, delay, chunkSize) {
    console.log(`Starting Batched (chunkSize=${chunkSize}) approach for ${ids.length} items...`);
    let activeRequests = 0;
    let maxActive = 0;

    const startTime = Date.now();

    // Chunking logic we plan to use
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (id) => {
            activeRequests++;
            if (activeRequests > maxActive) {
                maxActive = activeRequests;
            }
            await simulateNetworkRequest(id, delay);
            activeRequests--;
        }));
    }

    const duration = Date.now() - startTime;
    return { maxActive, duration, name: `Batched (${chunkSize})` };
}

async function main() {
    const ids = Array.from({ length: 100 }, (_, i) => i);
    const networkDelay = 50; // ms

    const unbatchedResult = await runUnbatched(ids, networkDelay);
    console.log(unbatchedResult);

    const batchedResult = await runBatched(ids, networkDelay, 5);
    console.log(batchedResult);

    console.log("\n--- Results ---");
    console.log(`Unbatched: Peak concurrency was ${unbatchedResult.maxActive}. Time: ${unbatchedResult.duration}ms`);
    console.log(`Batched: Peak concurrency was ${batchedResult.maxActive}. Time: ${batchedResult.duration}ms`);
    console.log(`Improvement: Peak concurrency reduced by ${unbatchedResult.maxActive - batchedResult.maxActive} requests (which avoids 429 Too Many Requests and reduces frontend I/O congestion).`);
}

main().catch(console.error);
