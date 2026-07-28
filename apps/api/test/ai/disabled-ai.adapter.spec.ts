import { DisabledAiAssistantAdapter } from '../../src/common/ports/disabled-ai.adapter';

/**
 * Unit tests for DisabledAiAssistantAdapter.
 * Verifies that the disabled AI adapter never calls any external provider
 * and always returns isDisabled: true.
 */
describe('DisabledAiAssistantAdapter (unit)', () => {
  let adapter: DisabledAiAssistantAdapter;

  const mockContext = {
    userId: 'test-user-001',
    sessionId: 'test-session-001',
    locale: 'vi' as const,
  };

  beforeEach(() => {
    adapter = new DisabledAiAssistantAdapter();
  });

  describe('draftLessonReport()', () => {
    it('should return isDisabled: true', async () => {
      const result = await adapter.draftLessonReport(mockContext, {});
      expect(result.isDisabled).toBe(true);
    });

    it('should return an empty suggestion string', async () => {
      const result = await adapter.draftLessonReport(mockContext, {});
      expect(result.suggestion).toBe('');
    });

    it('should not make any network calls (no fetch/axios calls)', async () => {
      // If no external module is called, this will simply resolve
      const spy = jest.spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('Network call detected in disabled AI adapter!');
      });

      await expect(adapter.draftLessonReport(mockContext, {})).resolves.toBeDefined();
      spy.mockRestore();
    });
  });

  describe('querySummary()', () => {
    it('should return isDisabled: true', async () => {
      const result = await adapter.querySummary(mockContext, 'test query');
      expect(result.isDisabled).toBe(true);
    });

    it('should return an empty suggestion string', async () => {
      const result = await adapter.querySummary(mockContext, 'test query');
      expect(result.suggestion).toBe('');
    });
  });

  describe('isActionPermissible()', () => {
    it('should return false for AUTO_APPROVE', () => {
      expect(adapter.isActionPermissible('AUTO_APPROVE')).toBe(false);
    });

    it('should return false for AUTO_REJECT', () => {
      expect(adapter.isActionPermissible('AUTO_REJECT')).toBe(false);
    });

    it('should return false for AUTO_MODIFY', () => {
      expect(adapter.isActionPermissible('AUTO_MODIFY')).toBe(false);
    });

    it('should return false for SUGGEST when AI is disabled', () => {
      expect(adapter.isActionPermissible('SUGGEST')).toBe(false);
    });

    it('should return false for DRAFT when AI is disabled', () => {
      expect(adapter.isActionPermissible('DRAFT')).toBe(false);
    });

    it('should return false for SUMMARIZE when AI is disabled', () => {
      expect(adapter.isActionPermissible('SUMMARIZE')).toBe(false);
    });
  });
});
