/**
 * Automated Verification Script for NoteLand Backend APIs
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess;
let token = '';

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting NoteLand server on port', PORT, '...');
    
    serverProcess = spawn('node', [path.join(__dirname, 'backend/server.js')], {
      env: { ...process.env, PORT: PORT.toString(), NODE_ENV: 'test' }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('NoteLand Server is running on')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server Error Output:', data.toString());
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    // Timeout if server doesn't start in 5 seconds
    setTimeout(() => {
      reject(new Error('Server start timed out after 5 seconds'));
    }, 5000);
  });
}

async function runTests() {
  const timestamp = Date.now();
  const testUser = {
    name: 'Verification Bot',
    email: `bot-${timestamp}@example.com`,
    password: 'securePassword123'
  };

  let noteId = null;
  let tagId = null;

  try {
    console.log('\n--- 1. Testing Registration ---');
    const registerRes = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    const registerData = await registerRes.json();
    if (registerRes.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    console.log('✅ Registration Successful!');

    console.log('\n--- 2. Testing Login ---');
    const loginRes = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password })
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    token = loginData.token;
    if (!token) throw new Error('No JWT token returned in login response');
    console.log('✅ Login Successful! Token extracted.');

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    console.log('\n--- 3. Testing Get Current User (/me) ---');
    const meRes = await fetch(`${BASE_URL}/me`, { headers: authHeaders });
    const meData = await meRes.json();
    if (meRes.status !== 200 || meData.user.email !== testUser.email) {
      throw new Error(`Auth verify failed: ${JSON.stringify(meData)}`);
    }
    console.log(`✅ Auth Verify Success: Logged in as ${meData.user.name}`);

    console.log('\n--- 4. Testing Creating a Tag ---');
    const tagRes = await fetch(`${BASE_URL}/tags`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Verification' })
    });
    const tagData = await tagRes.json();
    if (tagRes.status !== 201) throw new Error(`Tag creation failed: ${JSON.stringify(tagData)}`);
    tagId = tagData.id;
    console.log(`✅ Tag Created Successfully: ${tagData.name} (ID: ${tagId})`);

    console.log('\n--- 5. Testing Creating a Note with Tags ---');
    const noteRes = await fetch(`${BASE_URL}/notes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Verification Note',
        content: 'Testing note lifecycle endpoints.',
        color: '#aecbfa',
        tags: ['Verification', 'Automated']
      })
    });
    const noteData = await noteRes.json();
    if (noteRes.status !== 201) throw new Error(`Note creation failed: ${JSON.stringify(noteData)}`);
    noteId = noteData.id;
    console.log(`✅ Note Created Successfully! ID: ${noteId}, Color: ${noteData.color}, Tags count: ${noteData.tags.length}`);

    console.log('\n--- 6. Testing Fetching Notes ---');
    const listRes = await fetch(`${BASE_URL}/notes`, { headers: authHeaders });
    const listData = await listRes.json();
    if (listRes.status !== 200 || listData.length === 0) {
      throw new Error(`Notes fetch failed: ${JSON.stringify(listData)}`);
    }
    console.log(`✅ Note list retrieved successfully. Found ${listData.length} note(s).`);

    console.log('\n--- 7. Testing Pinning Note ---');
    const pinRes = await fetch(`${BASE_URL}/notes/pin/${noteId}`, {
      method: 'PATCH',
      headers: authHeaders
    });
    const pinData = await pinRes.json();
    if (pinRes.status !== 200 || !pinData.isPinned) {
      throw new Error(`Pin toggling failed: ${JSON.stringify(pinData)}`);
    }
    console.log('✅ Note Pinned Successfully!');

    console.log('\n--- 8. Testing Archiving Note ---');
    const archRes = await fetch(`${BASE_URL}/notes/archive/${noteId}`, {
      method: 'PATCH',
      headers: authHeaders
    });
    const archData = await archRes.json();
    // Archiving should automatically unpin
    if (archRes.status !== 200 || !archData.isArchived || archData.isPinned) {
      throw new Error(`Archiving failed: ${JSON.stringify(archData)}`);
    }
    console.log('✅ Note Archived Successfully (and unpinned)!');

    console.log('\n--- 9. Testing Moving Note to Trash ---');
    const trashRes = await fetch(`${BASE_URL}/notes/trash/${noteId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isDeleted: true })
    });
    const trashData = await trashRes.json();
    if (trashRes.status !== 200 || !trashData.isDeleted) {
      throw new Error(`Trashing failed: ${JSON.stringify(trashData)}`);
    }
    console.log('✅ Note Trashed Successfully!');

    console.log('\n--- 10. Testing Permanent Deletion ---');
    const delRes = await fetch(`${BASE_URL}/notes/${noteId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const delData = await delRes.json();
    if (delRes.status !== 200) throw new Error(`Permanent deletion failed: ${JSON.stringify(delData)}`);
    console.log('✅ Note Permanently Deleted Successfully!');

    console.log('\n=========================================');
    console.log('🎉 ALL BACKEND TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=========================================');
    cleanUp(0);
  } catch (error) {
    console.error('\n❌ Test execution failed with error:', error.message);
    cleanUp(1);
  }
}

function cleanUp(exitCode) {
  if (serverProcess) {
    console.log('Stopping test server...');
    serverProcess.kill();
  }
  process.exit(exitCode);
}

// Main Runner
startServer()
  .then(runTests)
  .catch((err) => {
    console.error('Failed to start test server:', err.message);
    process.exit(1);
  });
