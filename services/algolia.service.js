// services/algolia.service.js - Algolia search integration service

const { algoliasearch } = require('algoliasearch');

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
    if (!this.client) return;

    try {
      const record = {
        objectID: user._id.toString(),
        username: user.username,
        displayName: user.profile?.displayName,
        avatar: user.profile?.avatar,
        bio: user.profile?.bio,
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
        settings: {
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
        settings: {
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
