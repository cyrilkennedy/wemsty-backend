// services/algolia.service.js - Algolia search integration service

const { algoliasearch } = require('algoliasearch');
const { searchIndexQueue } = require('../queues');
const { addJob, queuesEnabled } = require('./queue.service');

function isPublicSearchablePost(post = {}) {
  return (
    post.status !== 'deleted' &&
    post.status !== 'hidden' &&
    post.status !== 'shadow_hidden' &&
    (post.status || 'active') === 'active' &&
    post.visibility === 'public'
  );
}

function shouldDeletePostUpdate(updates = {}) {
  return (
    ['deleted', 'hidden', 'shadow_hidden'].includes(updates.status) ||
    (updates.visibility && updates.visibility !== 'public')
  );
}

class AlgoliaService {
  constructor() {
    this.appId = process.env.ALGOLIA_APP_ID;
    this.apiKey = process.env.ALGOLIA_ADMIN_KEY;
    
    if (!this.appId || !this.apiKey) {
      console.warn('⚠️  Algolia credentials missing. Search indexing will be disabled.');
      this.client = null;
      return;
    }

    try {
      this.client = algoliasearch(this.appId, this.apiKey);
      
      // Initialize indexes
      this.postsIndexName = process.env.ALGOLIA_POSTS_INDEX || 'wemsty_posts';
      this.usersIndexName = process.env.ALGOLIA_USERS_INDEX || 'wemsty_users';
      this.circlesIndexName = process.env.ALGOLIA_CIRCLES_INDEX || 'wemsty_circles';
      
      console.log('✅ Algolia client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Algolia client:', error.message);
      this.client = null;
    }
  }

  /**
   * Index or update a post
   */
  async savePost(post) {
    if (!isPublicSearchablePost(post)) {
      await this.deletePost(post._id);
      return;
    }

    if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
      await addJob(searchIndexQueue, 'index-entity', {
        action: 'save',
        entityType: 'post',
        entityId: post._id?.toString(),
        payload: post
      });
      return;
    }

    if (!this.client) return;

    try {
      const record = {
        objectID: post._id.toString(),
        text: post.content?.text,
        authorId: post.author.toString(),
        postType: post.postType,
        category: post.category,
        hashtags: post.content?.hashtags || [],
        visibility: post.visibility,
        createdAt: post.createdAt,
        engagement: {
          likes: post.engagement?.likes || 0,
          reposts: post.engagement?.reposts || 0,
          comments: post.engagement?.comments || 0
        },
        sphereScore: post.sphereScore || 0,
        _tags: ['post', post.category, ... (post.content?.hashtags || [])]
      };

      await this.client.saveObject({
        indexName: this.postsIndexName,
        body: record
      });
      
      // console.log(`🔍 Indexed post: ${post._id}`);
    } catch (error) {
      console.error(`❌ Algolia savePost error: ${error.message}`);
    }
  }

  /**
   * Update post ranking/engagement in Algolia
   */
  async updatePost(postId, updates) {
    if (shouldDeletePostUpdate(updates)) {
      await this.deletePost(postId);
      return;
    }

    if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
      await addJob(searchIndexQueue, 'index-entity', {
        action: 'update',
        entityType: 'post',
        entityId: postId.toString(),
        payload: updates
      });
      return;
    }

    if (!this.client) return;

    try {
      await this.client.partialUpdateObject({
        indexName: this.postsIndexName,
        objectID: postId.toString(),
        attributesToUpdate: updates
      });
    } catch (error) {
      console.error(`❌ Algolia updatePost error: ${error.message}`);
    }
  }

  /**
   * Remove post from index
   */
  async deletePost(postId) {
    if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
      await addJob(searchIndexQueue, 'index-entity', {
        action: 'delete',
        entityType: 'post',
        entityId: postId.toString()
      });
      return;
    }

    if (!this.client) return;

    try {
      await this.client.deleteObject({
        indexName: this.postsIndexName,
        objectID: postId.toString()
      });
    } catch (error) {
      console.error(`❌ Algolia deletePost error: ${error.message}`);
    }
  }

  /**
   * Index or update a user profile
   */
  async saveUser(user) {
    if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
      await addJob(searchIndexQueue, 'index-entity', {
        action: 'save',
        entityType: 'user',
        entityId: user._id?.toString(),
        payload: user
      });
      return;
    }

    if (!this.client) return;

    try {
      // Prevent large records by cleaning up fields
      const avatar = user.profile?.avatar;
      const isBase64 = avatar?.startsWith('data:');
      
      const record = {
        objectID: user._id.toString(),
        username: user.username,
        displayName: user.profile?.displayName,
        avatar: isBase64 ? null : avatar, // Don't index base64 strings
        bio: user.profile?.bio?.substring(0, 500), // Truncate long bios
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        followersCount: user.followers_count || 0,
        _tags: ['user', user.role]
      };

      await this.client.saveObject({
        indexName: this.usersIndexName,
        body: record
      });
    } catch (error) {
      console.error(`❌ Algolia saveUser error: ${error.message}`);
    }
  }

  /**
   * Index or update a Circle (Community)
   */
  async saveCircle(circle) {
    if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
      await addJob(searchIndexQueue, 'index-entity', {
        action: 'save',
        entityType: 'circle',
        entityId: circle._id?.toString(),
        payload: circle
      });
      return;
    }

    if (!this.client) return;

    try {
      const record = {
        objectID: circle._id.toString(),
        name: circle.name,
        slug: circle.slug,
        description: circle.description,
        avatar: circle.avatar,
        privacy: circle.privacy,
        memberCount: circle.memberCount || 0,
        category: circle.category,
        _tags: ['circle', circle.category, circle.privacy]
      };

      await this.client.saveObject({
        indexName: this.circlesIndexName,
        body: record
      });
    } catch (error) {
      console.error(`❌ Algolia saveCircle error: ${error.message}`);
    }
  }

  /**
   * Search across all indexes (or a specific one)
   */
  async search(query, options = {}) {
    if (!this.client) return { hits: [], nbHits: 0 };

    const {
      index = 'posts',
      page = 0,
      hitsPerPage = 20,
      filters = ''
    } = options;

    const indexName = index === 'users' ? this.usersIndexName : 
                     index === 'circles' ? this.circlesIndexName : 
                     this.postsIndexName;

    try {
      const result = await this.client.searchSingleIndex({
        indexName,
        searchParams: {
          query,
          page,
          hitsPerPage,
          filters
        }
      });
      return result;
    } catch (error) {
      console.error(`❌ Algolia search error: ${error.message}`);
      return { hits: [], nbHits: 0 };
    }
  }

  /**
   * Configure index settings (Relevancy, Searchable Attributes, etc.)
   */
  async configureIndexes() {
    if (!this.client) return;

    try {
      // Configure Posts Index
      await this.client.setSettings({
        indexName: this.postsIndexName,
        indexSettings: {
          searchableAttributes: [
            'text',
            'hashtags',
            'unordered(category)'
          ],
          customRanking: [
            'desc(sphereScore)',
            'desc(engagement.likes)',
            'desc(createdAt)'
          ],
          attributesForFaceting: [
            'category',
            'postType',
            'visibility',
            'authorId'
          ]
        }
      });

      // Configure Users Index
      await this.client.setSettings({
        indexName: this.usersIndexName,
        indexSettings: {
          searchableAttributes: [
            'username',
            'displayName',
            'unordered(bio)'
          ],
          customRanking: [
            'desc(followersCount)',
            'desc(isEmailVerified)'
          ]
        }
      });

      console.log('✅ Algolia indexes configured');
    } catch (error) {
      console.error(`❌ Algolia configureIndexes error: ${error.message}`);
    }
  }
}

module.exports = new AlgoliaService();
