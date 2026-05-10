const axios = require('axios');

/**
 * Checks for the latest release on GitHub for a private repository.
 * Proxies the request to keep the GitHub PAT secure on the server.
 */
exports.checkUpdate = async (req, res) => {
  try {
    const { GITHUB_ACCESS_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = process.env;

    if (!GITHUB_ACCESS_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
      return res.status(500).json({
        success: false,
        message: 'GitHub configuration is missing on the server.'
      });
    }

    const githubUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

    const response = await axios.get(githubUrl, {
      headers: {
        'Authorization': `token ${GITHUB_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const latestRelease = response.data;

    // Find the update.zip asset
    const asset = latestRelease.assets.find(a => a.name === 'update.zip');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'No update.zip found in the latest release.'
      });
    }

    // Return a simplified object for the frontend
    // We provide a proxy URL for the download to handle authentication
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      success: true,
      version: latestRelease.tag_name,
      notes: latestRelease.body,
      download_url: `${baseUrl}/api/mobile/update-download/${asset.id}`,
      published_at: latestRelease.published_at
    });

  } catch (error) {
    console.error('[UpdateController] Error checking updates:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch update information from GitHub.'
    });
  }
};

/**
 * Proxies the download of a release asset from GitHub.
 * This allows the mobile app to download from a private repo without a token.
 */
exports.downloadUpdate = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { GITHUB_ACCESS_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = process.env;

    if (!GITHUB_ACCESS_TOKEN) {
      return res.status(500).json({ message: 'GitHub token missing.' });
    }

    const assetUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/assets/${assetId}`;

    const response = await axios({
      method: 'get',
      url: assetUrl,
      headers: {
        'Authorization': `token ${GITHUB_ACCESS_TOKEN}`,
        'Accept': 'application/octet-stream'
      },
      responseType: 'stream'
    });

    // Set appropriate headers for a zip file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=update.zip');

    // Pipe the GitHub stream directly to our response
    response.data.pipe(res);

  } catch (error) {
    console.error('[UpdateController] Error downloading update:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to download update from GitHub.'
    });
  }
};
