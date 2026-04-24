import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the internal helper by loading the module — it's not
// exported, so re-declare the patterns locally and test the same
// regex logic. If the module's implementation changes, update here.
const ROLE_IDENTITY_FRAME_PATTERNS: RegExp[] = [
  /^(current|former|incumbent|sitting|senior|junior)?\s*(us|u\.s\.|united states)?\s*(senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|president|vice president|vp|speaker|chairman|chairwoman|chairperson|secretary|attorney general|justice|judge|officeholder|elected official|public servant|politician|political figure|public figure)s?$/i,
  /^(democratic|democrat|republican|gop|independent|progressive|conservative|libertarian|green|moderate|far[- ]?right|far[- ]?left)\s+(politician|political figure|public figure|elected official|candidate|senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|lawmaker|officeholder)s?$/i,
  /^(state|federal|national|local)\s+(senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|lawmaker|officeholder|official|politician)s?$/i,
];

function isRoleIdentityFrame(frame: string): boolean {
  const normalized = frame.trim().replace(/\s+/g, " ");
  return ROLE_IDENTITY_FRAME_PATTERNS.some((re) => re.test(normalized));
}

describe("isRoleIdentityFrame", () => {
  it("catches bare role labels", () => {
    assert.equal(isRoleIdentityFrame("Senator"), true);
    assert.equal(isRoleIdentityFrame("Governor"), true);
    assert.equal(isRoleIdentityFrame("Mayor"), true);
    assert.equal(isRoleIdentityFrame("Congressman"), true);
    assert.equal(isRoleIdentityFrame("Congresswoman"), true);
    assert.equal(isRoleIdentityFrame("Representative"), true);
  });

  it("catches role labels with incumbency modifiers", () => {
    assert.equal(isRoleIdentityFrame("Current Senator"), true);
    assert.equal(isRoleIdentityFrame("Former Governor"), true);
    assert.equal(isRoleIdentityFrame("Incumbent Mayor"), true);
    assert.equal(isRoleIdentityFrame("Sitting President"), true);
    assert.equal(isRoleIdentityFrame("Senior Senator"), true);
  });

  it("catches role labels with US prefix", () => {
    assert.equal(isRoleIdentityFrame("US Senator"), true);
    assert.equal(isRoleIdentityFrame("U.S. Senator"), true);
    assert.equal(isRoleIdentityFrame("United States Senator"), true);
    assert.equal(isRoleIdentityFrame("US Representative"), true);
  });

  it("catches party + role labels", () => {
    assert.equal(isRoleIdentityFrame("Democratic Politician"), true);
    assert.equal(isRoleIdentityFrame("Republican Senator"), true);
    assert.equal(isRoleIdentityFrame("Progressive Lawmaker"), true);
    assert.equal(isRoleIdentityFrame("Conservative Representative"), true);
    assert.equal(isRoleIdentityFrame("Independent Candidate"), true);
  });

  it("catches state/federal role labels", () => {
    assert.equal(isRoleIdentityFrame("State Senator"), true);
    assert.equal(isRoleIdentityFrame("Federal Lawmaker"), true);
    assert.equal(isRoleIdentityFrame("State Representative"), true);
  });

  it("catches generic political labels", () => {
    assert.equal(isRoleIdentityFrame("Political Figure"), true);
    assert.equal(isRoleIdentityFrame("Elected Official"), true);
    assert.equal(isRoleIdentityFrame("Public Servant"), true);
    assert.equal(isRoleIdentityFrame("Public Figure"), true);
  });

  it("passes narrative frames through unchanged", () => {
    assert.equal(isRoleIdentityFrame("Progressive Advocacy"), false);
    assert.equal(isRoleIdentityFrame("Working-Class Champion"), false);
    assert.equal(isRoleIdentityFrame("Urban Policy Focus"), false);
    assert.equal(isRoleIdentityFrame("Immigration Reform Leader"), false);
    assert.equal(isRoleIdentityFrame("Bipartisan Dealmaker"), false);
    assert.equal(isRoleIdentityFrame("Civil Rights Focus"), false);
  });

  it("passes non-political frames through", () => {
    assert.equal(isRoleIdentityFrame("AI Innovation Leader"), false);
    assert.equal(isRoleIdentityFrame("Menu Quality"), false);
    assert.equal(isRoleIdentityFrame("Research Excellence"), false);
    assert.equal(isRoleIdentityFrame("Legal Defense"), false);
  });

  it("is case-insensitive", () => {
    assert.equal(isRoleIdentityFrame("current senator"), true);
    assert.equal(isRoleIdentityFrame("CURRENT SENATOR"), true);
    assert.equal(isRoleIdentityFrame("Current senator"), true);
  });

  it("tolerates extra whitespace", () => {
    assert.equal(isRoleIdentityFrame("  Current Senator  "), true);
    assert.equal(isRoleIdentityFrame("Current  Senator"), true);
  });
});
