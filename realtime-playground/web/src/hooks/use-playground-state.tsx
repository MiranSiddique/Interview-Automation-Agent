"use client";

import React, {
  createContext,
  useReducer,
  useContext,
  ReactNode,
  Dispatch,
} from "react";
import {
  PlaygroundState,
  defaultSessionConfig,
  defaultPlaygroundState,
} from "@/data/playground-state";
import { playgroundStateHelpers } from "@/lib/playground-state-helpers";

// Actions
// We re-introduce a subset of prior actions used by existing UI components
// to avoid TypeScript errors (Auth, InstructionsEditor, PresetSave etc.).
// If some features are intentionally hidden in the new simplified flow,
// leaving these no-op capable still keeps backward compatibility.
type Action =
  | { type: "SET_SESSION_CONFIG"; payload: Partial<PlaygroundState["sessionConfig"]> }
  | { type: "SET_ROOM_NAME"; payload: string }
  | { type: "SET_API_KEY"; payload: string | null | undefined }
  | { type: "SET_INSTRUCTIONS"; payload: string }
  | { type: "SAVE_USER_PRESET"; payload: any } // keep loose typing to avoid importing Preset here
  | { type: "SET_SELECTED_PRESET_ID"; payload: string | null };

function playgroundStateReducer(
  state: PlaygroundState,
  action: Action,
): PlaygroundState {
  switch (action.type) {
    case "SET_SESSION_CONFIG":
      return {
        ...state,
        sessionConfig: {
          ...state.sessionConfig,
          ...action.payload,
        },
      };
    case "SET_ROOM_NAME":
      return {
        ...state,
        roomName: action.payload,
      };
    case "SET_API_KEY":
      return {
        ...state,
        openaiAPIKey: action.payload ?? null,
      };
    case "SET_INSTRUCTIONS":
      return {
        ...state,
        instructions: action.payload,
      };
    case "SAVE_USER_PRESET": {
      // Minimal implementation: replace or append
      const existing = state.userPresets.filter((p: any) => p.id !== action.payload.id);
      return {
        ...state,
        userPresets: [...existing, action.payload],
      };
    }
    case "SET_SELECTED_PRESET_ID":
      return {
        ...state,
        selectedPresetId: action.payload,
      };
    default:
      return state;
  }
}

interface PlaygroundStateContextProps {
  pgState: PlaygroundState;
  dispatch: Dispatch<Action>;
  helpers: typeof playgroundStateHelpers;
}

const PlaygroundStateContext = createContext<
  PlaygroundStateContextProps | undefined
>(undefined);

export const usePlaygroundState = (): PlaygroundStateContextProps => {
  const ctx = useContext(PlaygroundStateContext);
  if (!ctx) {
    throw new Error(
      "usePlaygroundState must be used within a PlaygroundStateProvider",
    );
  }
  return ctx;
};

interface PlaygroundStateProviderProps {
  children: ReactNode;
}

export const PlaygroundStateProvider = ({
  children,
}: PlaygroundStateProviderProps) => {
  // Start from default state but force-openai fields to neutral values
  const initial: PlaygroundState = {
    ...defaultPlaygroundState,
    openaiAPIKey: null,
    instructions: "",
    userPresets: [], // ignore presets
    selectedPresetId: null,
    sessionConfig: defaultSessionConfig,
  };

  const [state, dispatch] = useReducer(playgroundStateReducer, initial);

  return (
    <PlaygroundStateContext.Provider
      value={{
        pgState: state,
        dispatch,
        helpers: playgroundStateHelpers,
      }}
    >
      {children}
    </PlaygroundStateContext.Provider>
  );
};