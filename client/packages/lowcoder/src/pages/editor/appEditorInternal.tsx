import { AppSummaryInfo, updateApplication } from "redux/reduxActions/applicationActions";
import { useDispatch, useSelector } from "react-redux";
import { getExternalEditorState } from "redux/selectors/configSelectors";
import { useEffect, useMemo, useState } from "react";
import {
  ExternalEditorContext,
  ExternalEditorContextState,
} from "util/context/ExternalEditorContext";
import { setEditorExternalStateAction } from "redux/reduxActions/configActions";
import { AppTypeEnum } from "constants/applicationConstants";
import EditorSkeletonView from "pages/editor/editorSkeletonView";
import { useThrottle, useUnmount } from "react-use";
import { Comp } from "lowcoder-core";
import { localEnv } from "util/envUtils";
import { saveMainComp } from "util/localStorageUtil";
import { RootComp } from "comps/comps/rootComp";
import { useAppHistory } from "util/editoryHistory";
import { useCompInstance } from "comps/utils/useCompInstance";
import { MarkAppInitialized, perfMark } from "util/perfUtils";
import { default as ConfigProvider } from "antd/es/config-provider";
import { default as message } from "antd/es/message";
import { getAntdLocale } from "i18n/antdLocale";
import { useUserViewMode } from "../../util/hooks";
import { QueryApi } from "api/queryApi";
import { RootCompInstanceType } from "./useRootCompInstance";

/**
 * FIXME: optimize the logic of saving comps
 * compose debounce + throttle
 * make sure savingComps succeed before executing
 */
function useSaveComp(
  applicationId: string,
  readOnly: boolean,
  rootCompInstance: RootCompInstanceType | undefined
) {
  const originalComp = rootCompInstance?.comp;
  // throttle comp change
  const comp = useThrottle(originalComp, 1000);
  const dispatch = useDispatch();
  const [prevComp, setPrevComp] = useState<Comp>();
  const [prevJsonStr, setPrevJsonStr] = useState<string>();

  useEffect(() => {
    if (readOnly) {
      return;
    }
    if (!comp || comp === prevComp) {
      return;
    }
    const curJson = comp.toJsonValue();
    const curJsonStr = JSON.stringify(curJson);
    if (prevJsonStr === curJsonStr) {
      return;
    }
    // the first time is a normal change, the latter is the manual update
    if (prevComp) {
      dispatch(
        updateApplication({
          applicationId: applicationId,
          editingApplicationDSL: curJson as object,
        })
      );
      // save to local
      localEnv() && saveMainComp(curJson);
    }
    setPrevComp(comp);
    setPrevJsonStr(curJsonStr);
  }, [comp, applicationId, prevComp, prevJsonStr, readOnly, dispatch]);
}

interface AppEditorInternalViewProps {
  readOnly: boolean;
  appInfo: AppSummaryInfo;
  loading: boolean;
  compInstance: RootCompInstanceType;
}

export function AppEditorInternalView(props: AppEditorInternalViewProps) {
  const isUserViewMode = useUserViewMode();
  const extraExternalEditorState = useSelector(getExternalEditorState);
  const dispatch = useDispatch();
  const { readOnly, appInfo, compInstance } = props;

  const [externalEditorState, setExternalEditorState] = useState<ExternalEditorContextState>({
    changeExternalState: (state: Partial<ExternalEditorContextState>) => {
      dispatch(setEditorExternalStateAction(state));
    },
    applicationId: appInfo.id,
    appType: AppTypeEnum.Application,
  });
  useSaveComp(appInfo.id, readOnly, compInstance);

  useEffect(() => {
    setExternalEditorState((s) => ({
      ...s,
      history: compInstance?.history,
      readOnly,
      appType: appInfo.appType,
      applicationId: appInfo.id,
      hideHeader: window.location.pathname.split("/")[3] === "admin",
      ...extraExternalEditorState,
    }));
  }, [compInstance?.history, extraExternalEditorState, readOnly, appInfo.appType, appInfo.id]);

  useEffect(() => {
    message.config({
      top: isUserViewMode ? 0 : 48,
    });
  }, [isUserViewMode]);

  const loading =
    !compInstance || !compInstance.comp || !compInstance.comp.preloaded || props.loading;

  return loading ? (
    window.location.pathname.split("/")[3] === "admin" ? <div></div> : 
    <EditorSkeletonView />
  ) : (
    // Falk - here we could add the language choise?
    <ConfigProvider locale={getAntdLocale()}>
      <ExternalEditorContext.Provider value={externalEditorState}>
        {compInstance?.comp?.getView()}
      </ExternalEditorContext.Provider>
    </ConfigProvider>
  );
}
