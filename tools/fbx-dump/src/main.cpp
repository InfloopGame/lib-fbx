#ifndef NOMINMAX
#define NOMINMAX
#endif

#include "json_writer.h"

#include <fbxsdk.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

static const char* MappingName(FbxLayerElement::EMappingMode m)
{
    switch (m) {
    case FbxLayerElement::eNone: return "eNone";
    case FbxLayerElement::eByControlPoint: return "eByControlPoint";
    case FbxLayerElement::eByPolygonVertex: return "eByPolygonVertex";
    case FbxLayerElement::eByPolygon: return "eByPolygon";
    case FbxLayerElement::eByEdge: return "eByEdge";
    case FbxLayerElement::eAllSame: return "eAllSame";
    default: return "unknown";
    }
}

static const char* ReferenceName(FbxLayerElement::EReferenceMode m)
{
    switch (m) {
    case FbxLayerElement::eDirect: return "eDirect";
    case FbxLayerElement::eIndex: return "eIndex";
    case FbxLayerElement::eIndexToDirect: return "eIndexToDirect";
    default: return "unknown";
    }
}

static const char* TypeName(EFbxType t)
{
    switch (t) {
    case eFbxUndefined: return "eFbxUndefined";
    case eFbxChar: return "eFbxChar";
    case eFbxUChar: return "eFbxUChar";
    case eFbxShort: return "eFbxShort";
    case eFbxUShort: return "eFbxUShort";
    case eFbxUInt: return "eFbxUInt";
    case eFbxLongLong: return "eFbxLongLong";
    case eFbxULongLong: return "eFbxULongLong";
    case eFbxHalfFloat: return "eFbxHalfFloat";
    case eFbxBool: return "eFbxBool";
    case eFbxInt: return "eFbxInt";
    case eFbxFloat: return "eFbxFloat";
    case eFbxDouble: return "eFbxDouble";
    case eFbxDouble2: return "eFbxDouble2";
    case eFbxDouble3: return "eFbxDouble3";
    case eFbxDouble4: return "eFbxDouble4";
    case eFbxDouble4x4: return "eFbxDouble4x4";
    case eFbxEnum: return "eFbxEnum";
    case eFbxEnumM: return "eFbxEnumM";
    case eFbxString: return "eFbxString";
    case eFbxTime: return "eFbxTime";
    case eFbxReference: return "eFbxReference";
    case eFbxBlob: return "eFbxBlob";
    case eFbxDistance: return "eFbxDistance";
    case eFbxDateTime: return "eFbxDateTime";
    default: return "unknown";
    }
}

static unsigned long long Uid(const FbxObject* o)
{
    return o ? static_cast<unsigned long long>(o->GetUniqueID()) : 0ull;
}

static void writeVec2(JsonWriter& j, const FbxVector2& v)
{
    j.beginArray();
    j.value(v[0]);
    j.value(v[1]);
    j.endArray();
}

static void writeVec4(JsonWriter& j, const FbxVector4& v)
{
    j.beginArray();
    j.value(v[0]);
    j.value(v[1]);
    j.value(v[2]);
    j.value(v[3]);
    j.endArray();
}

static void writeColor(JsonWriter& j, const FbxColor& c)
{
    j.beginArray();
    j.value(c.mRed);
    j.value(c.mGreen);
    j.value(c.mBlue);
    j.value(c.mAlpha);
    j.endArray();
}

static void writeAMatrix(JsonWriter& j, const FbxAMatrix& m)
{
    j.beginArray();
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
            j.value(m.Get(r, c));
    j.endArray();
}

static void writeMatrix(JsonWriter& j, const FbxMatrix& m)
{
    j.beginArray();
    for (int r = 0; r < 4; ++r)
        for (int c = 0; c < 4; ++c)
            j.value(m.Get(r, c));
    j.endArray();
}

static void writeIdArray(JsonWriter& j, FbxObject* owner, bool src)
{
    j.beginArray();
    const int n = src ? owner->GetSrcObjectCount() : owner->GetDstObjectCount();
    for (int i = 0; i < n; ++i) {
        FbxObject* o = src ? owner->GetSrcObject(i) : owner->GetDstObject(i);
        if (o) j.value(static_cast<long long>(Uid(o)));
    }
    j.endArray();
}

static void dumpPropertyValue(JsonWriter& j, FbxProperty& p)
{
    const EFbxType t = p.GetPropertyDataType().GetType();
    switch (t) {
    case eFbxBool:
        j.value(p.Get<FbxBool>());
        break;
    case eFbxChar:
        j.value(static_cast<int>(p.Get<FbxChar>()));
        break;
    case eFbxUChar:
        j.value(static_cast<int>(p.Get<FbxUChar>()));
        break;
    case eFbxShort:
        j.value(static_cast<int>(p.Get<FbxShort>()));
        break;
    case eFbxUShort:
        j.value(static_cast<int>(p.Get<FbxUShort>()));
        break;
    case eFbxUInt:
        j.value(static_cast<unsigned>(p.Get<FbxUInt>()));
        break;
    case eFbxInt:
        j.value(p.Get<FbxInt>());
        break;
    case eFbxLongLong:
        j.value(static_cast<long long>(p.Get<FbxLongLong>()));
        break;
    case eFbxULongLong:
        j.value(static_cast<unsigned long long>(p.Get<FbxULongLong>()));
        break;
    case eFbxHalfFloat:
        j.value(static_cast<double>(p.Get<FbxHalfFloat>().value()));
        break;
    case eFbxFloat:
        j.value(static_cast<double>(p.Get<FbxFloat>()));
        break;
    case eFbxDouble:
        j.value(p.Get<FbxDouble>());
        break;
    case eFbxDouble2: {
        const FbxDouble2 v = p.Get<FbxDouble2>();
        j.beginArray();
        j.value(v[0]);
        j.value(v[1]);
        j.endArray();
        break;
    }
    case eFbxDouble3: {
        const FbxDouble3 v = p.Get<FbxDouble3>();
        j.beginArray();
        j.value(v[0]);
        j.value(v[1]);
        j.value(v[2]);
        j.endArray();
        break;
    }
    case eFbxDouble4: {
        const FbxDouble4 v = p.Get<FbxDouble4>();
        j.beginArray();
        j.value(v[0]);
        j.value(v[1]);
        j.value(v[2]);
        j.value(v[3]);
        j.endArray();
        break;
    }
    case eFbxDouble4x4: {
        const FbxDouble4x4 m = p.Get<FbxDouble4x4>();
        j.beginArray();
        for (int r = 0; r < 4; ++r)
            for (int c = 0; c < 4; ++c)
                j.value(m[r][c]);
        j.endArray();
        break;
    }
    case eFbxEnum:
    case eFbxEnumM: {
        j.beginObject();
        j.key("index").value(p.Get<FbxInt>());
        j.key("names");
        j.beginArray();
        for (int i = 0; i < p.GetEnumCount(); ++i) {
            const char* n = p.GetEnumValue(i);
            j.value(n ? n : "");
        }
        j.endArray();
        j.endObject();
        break;
    }
    case eFbxString:
        j.value(p.Get<FbxString>().Buffer());
        break;
    case eFbxTime:
        j.beginObject();
        j.key("ticks").value(static_cast<long long>(p.Get<FbxTime>().Get()));
        j.endObject();
        break;
    case eFbxReference: {
        j.beginArray();
        for (int i = 0; i < p.GetSrcObjectCount(); ++i) {
            if (FbxObject* o = p.GetSrcObject(i))
                j.value(static_cast<long long>(Uid(o)));
        }
        j.endArray();
        break;
    }
    case eFbxBlob: {
        const FbxBlob blob = p.Get<FbxBlob>();
        j.beginObject();
        j.key("size").value(blob.Size());
        j.endObject();
        break;
    }
    case eFbxDistance: {
        const FbxDistance d = p.Get<FbxDistance>();
        j.beginObject();
        j.key("value").value(d.value());
        j.key("unit").value(d.unitName());
        j.endObject();
        break;
    }
    case eFbxDateTime:
        j.value(p.Get<FbxDateTime>().toString().Buffer());
        break;
    default:
        j.nullValue();
        break;
    }
}

static void dumpProperty(JsonWriter& j, FbxProperty& p)
{
    j.beginObject();
    j.key("name").value(p.GetName().Buffer());
    j.key("hierarchicalName").value(p.GetHierarchicalName().Buffer());
    j.key("label").value(p.GetLabel().Buffer());
    j.key("dataType").value(static_cast<int>(p.GetPropertyDataType().GetType()));
    j.key("dataTypeName").value(TypeName(p.GetPropertyDataType().GetType()));
    j.key("typeName").value(p.GetPropertyDataType().GetName());
    j.key("flags").value(static_cast<unsigned>(p.GetFlags()));
    j.key("animatable").value(p.GetFlag(FbxPropertyFlags::eAnimatable));
    j.key("userDefined").value(p.GetFlag(FbxPropertyFlags::eUserDefined));
    if (p.HasMinLimit()) j.key("minLimit").value(p.GetMinLimit());
    if (p.HasMaxLimit()) j.key("maxLimit").value(p.GetMaxLimit());
    j.key("value");
    dumpPropertyValue(j, p);

    j.key("srcObjectIds");
    j.beginArray();
    for (int i = 0; i < p.GetSrcObjectCount(); ++i) {
        if (FbxObject* o = p.GetSrcObject(i))
            j.value(static_cast<long long>(Uid(o)));
    }
    j.endArray();
    j.key("dstObjectIds");
    j.beginArray();
    for (int i = 0; i < p.GetDstObjectCount(); ++i) {
        if (FbxObject* o = p.GetDstObject(i))
            j.value(static_cast<long long>(Uid(o)));
    }
    j.endArray();

    j.key("children");
    j.beginArray();
    for (FbxProperty child = p.GetChild(); child.IsValid(); child = child.GetSibling())
        dumpProperty(j, child);
    j.endArray();
    j.endObject();
}

template <typename El, typename T, typename WriteFn>
static void dumpLayerElement(JsonWriter& j, El* el, WriteFn writeItem)
{
    if (!el) {
        j.nullValue();
        return;
    }
    j.beginObject();
    j.key("name").value(el->GetName());
    j.key("mappingMode").value(static_cast<int>(el->GetMappingMode()));
    j.key("mappingModeName").value(MappingName(el->GetMappingMode()));
    j.key("referenceMode").value(static_cast<int>(el->GetReferenceMode()));
    j.key("referenceModeName").value(ReferenceName(el->GetReferenceMode()));
    j.key("directArray");
    j.beginArray();
    {
        auto& arr = el->GetDirectArray();
        for (int i = 0; i < arr.GetCount(); ++i) writeItem(j, arr.GetAt(i));
    }
    j.endArray();
    j.key("indexArray");
    j.beginArray();
    if (el->GetReferenceMode() != FbxLayerElement::eDirect) {
        auto& idx = el->GetIndexArray();
        for (int i = 0; i < idx.GetCount(); ++i) j.value(idx.GetAt(i));
    }
    j.endArray();
    j.endObject();
}

static void dumpMaterialLayer(JsonWriter& j, FbxGeometryElementMaterial* el)
{
    if (!el) {
        j.nullValue();
        return;
    }
    j.beginObject();
    j.key("name").value(el->GetName());
    j.key("mappingMode").value(static_cast<int>(el->GetMappingMode()));
    j.key("mappingModeName").value(MappingName(el->GetMappingMode()));
    j.key("referenceMode").value(static_cast<int>(el->GetReferenceMode()));
    j.key("referenceModeName").value(ReferenceName(el->GetReferenceMode()));
    j.key("indexArray");
    j.beginArray();
    auto& idx = el->GetIndexArray();
    for (int i = 0; i < idx.GetCount(); ++i) j.value(idx.GetAt(i));
    j.endArray();
    j.endObject();
}

static void dumpGeometryBase(JsonWriter& j, FbxGeometryBase* g)
{
    j.key("controlPoints");
    j.beginArray();
    const int n = g->GetControlPointsCount();
    FbxVector4* pts = g->GetControlPoints();
    for (int i = 0; i < n; ++i) {
        j.value(pts[i][0]);
        j.value(pts[i][1]);
        j.value(pts[i][2]);
    }
    j.endArray();

    j.key("normals");
    j.beginArray();
    for (int i = 0; i < g->GetElementNormalCount(); ++i)
        dumpLayerElement<FbxGeometryElementNormal, FbxVector4>(j, g->GetElementNormal(i), writeVec4);
    j.endArray();

    j.key("tangents");
    j.beginArray();
    for (int i = 0; i < g->GetElementTangentCount(); ++i)
        dumpLayerElement<FbxGeometryElementTangent, FbxVector4>(j, g->GetElementTangent(i), writeVec4);
    j.endArray();

    j.key("binormals");
    j.beginArray();
    for (int i = 0; i < g->GetElementBinormalCount(); ++i)
        dumpLayerElement<FbxGeometryElementBinormal, FbxVector4>(j, g->GetElementBinormal(i), writeVec4);
    j.endArray();

    j.key("uvs");
    j.beginArray();
    for (int i = 0; i < g->GetElementUVCount(); ++i)
        dumpLayerElement<FbxGeometryElementUV, FbxVector2>(j, g->GetElementUV(i), writeVec2);
    j.endArray();

    j.key("vertexColors");
    j.beginArray();
    for (int i = 0; i < g->GetElementVertexColorCount(); ++i)
        dumpLayerElement<FbxGeometryElementVertexColor, FbxColor>(j, g->GetElementVertexColor(i), writeColor);
    j.endArray();

    j.key("materials");
    j.beginArray();
    for (int i = 0; i < g->GetElementMaterialCount(); ++i)
        dumpMaterialLayer(j, g->GetElementMaterial(i));
    j.endArray();

    j.key("smoothing");
    j.beginArray();
    for (int i = 0; i < g->GetElementSmoothingCount(); ++i) {
        dumpLayerElement<FbxGeometryElementSmoothing, int>(j, g->GetElementSmoothing(i),
            [](JsonWriter& w, int v) { w.value(v); });
    }
    j.endArray();
}

static void dumpMesh(JsonWriter& j, FbxMesh* mesh)
{
    dumpGeometryBase(j, mesh);
    j.key("polygonCount").value(mesh->GetPolygonCount());
    j.key("polygonVertexCount").value(mesh->GetPolygonVertexCount());
    j.key("polygonSizes");
    j.beginArray();
    for (int i = 0; i < mesh->GetPolygonCount(); ++i)
        j.value(mesh->GetPolygonSize(i));
    j.endArray();

    j.key("polygonVertexIndex");
    j.beginArray();
    int* verts = mesh->GetPolygonVertices();
    for (int p = 0, polyCount = mesh->GetPolygonCount(); p < polyCount; ++p) {
        const int sz = mesh->GetPolygonSize(p);
        const int start = mesh->GetPolygonVertexIndex(p);
        for (int i = 0; i < sz; ++i) {
            const int idx = verts[start + i];
            j.value(i + 1 == sz ? -idx - 1 : idx);
        }
    }
    j.endArray();
}

static void dumpCluster(JsonWriter& j, FbxCluster* cluster)
{
    j.key("linkMode").value(static_cast<int>(cluster->GetLinkMode()));
    j.key("linkId").value(cluster->GetLink() ? static_cast<long long>(Uid(cluster->GetLink())) : -1ll);
    j.key("associateModelId")
        .value(cluster->GetAssociateModel() ? static_cast<long long>(Uid(cluster->GetAssociateModel())) : -1ll);
    j.key("indexes");
    j.beginArray();
    const int n = cluster->GetControlPointIndicesCount();
    int* idx = cluster->GetControlPointIndices();
    for (int i = 0; i < n; ++i) j.value(idx[i]);
    j.endArray();
    j.key("weights");
    j.beginArray();
    double* w = cluster->GetControlPointWeights();
    for (int i = 0; i < n; ++i) j.value(w[i]);
    j.endArray();
    FbxAMatrix t, tl;
    cluster->GetTransformMatrix(t);
    cluster->GetTransformLinkMatrix(tl);
    j.key("transform");
    writeAMatrix(j, t);
    j.key("transformLink");
    writeAMatrix(j, tl);
}

static void dumpAnimCurve(JsonWriter& j, FbxAnimCurve* curve)
{
    j.key("keys");
    j.beginArray();
    const int n = curve->KeyGetCount();
    for (int i = 0; i < n; ++i) {
        j.beginObject();
        j.key("time").value(static_cast<long long>(curve->KeyGetTime(i).Get()));
        j.key("value").value(static_cast<double>(curve->KeyGetValue(i)));
        j.key("interpolation").value(static_cast<int>(curve->KeyGetInterpolation(i)));
        j.key("tangentMode").value(static_cast<int>(curve->KeyGetTangentMode(i)));
        j.key("constantMode").value(static_cast<int>(curve->KeyGetConstantMode(i)));
        j.key("leftDerivative").value(static_cast<double>(curve->KeyGetLeftDerivative(i)));
        j.key("rightDerivative").value(static_cast<double>(curve->KeyGetRightDerivative(i)));
        j.endObject();
    }
    j.endArray();
}

static void dumpAnimCurveNode(JsonWriter& j, FbxAnimCurveNode* node)
{
    j.key("composite").value(node->IsComposite());
    j.key("channels");
    j.beginArray();
    const unsigned channels = node->GetChannelsCount();
    for (unsigned c = 0; c < channels; ++c) {
        j.beginObject();
        j.key("name").value(node->GetChannelName(static_cast<int>(c)).Buffer());
        j.key("value").value(node->GetChannelValue<double>(c, 0.0));
        j.key("curveIds");
        j.beginArray();
        const int n = node->GetCurveCount(c);
        for (int i = 0; i < n; ++i) {
            if (FbxAnimCurve* curve = node->GetCurve(c, static_cast<unsigned>(i)))
                j.value(static_cast<long long>(Uid(curve)));
        }
        j.endArray();
        j.endObject();
    }
    j.endArray();
}

static void dumpNode(JsonWriter& j, FbxNode* node)
{
    j.key("parentId").value(node->GetParent() ? static_cast<long long>(Uid(node->GetParent())) : -1ll);
    j.key("childIds");
    j.beginArray();
    for (int i = 0; i < node->GetChildCount(); ++i)
        j.value(static_cast<long long>(Uid(node->GetChild(i))));
    j.endArray();
    j.key("attributeIds");
    j.beginArray();
    for (int i = 0; i < node->GetNodeAttributeCount(); ++i) {
        if (FbxNodeAttribute* a = node->GetNodeAttributeByIndex(i))
            j.value(static_cast<long long>(Uid(a)));
    }
    j.endArray();
    j.key("materialIds");
    j.beginArray();
    for (int i = 0; i < node->GetMaterialCount(); ++i) {
        if (FbxSurfaceMaterial* m = node->GetMaterial(i))
            j.value(static_cast<long long>(Uid(m)));
    }
    j.endArray();

    EFbxRotationOrder rotOrder = eEulerXYZ;
    node->GetRotationOrder(FbxNode::eSourcePivot, rotOrder);
    j.key("rotationOrder").value(static_cast<int>(rotOrder));
    FbxTransform::EInheritType inherit = FbxTransform::eInheritRrSs;
    node->GetTransformationInheritType(inherit);
    j.key("inheritType").value(static_cast<int>(inherit));

    j.key("preRotation");
    writeVec4(j, node->GetPreRotation(FbxNode::eSourcePivot));
    j.key("postRotation");
    writeVec4(j, node->GetPostRotation(FbxNode::eSourcePivot));
    j.key("rotationPivot");
    writeVec4(j, node->GetRotationPivot(FbxNode::eSourcePivot));
    j.key("scalingPivot");
    writeVec4(j, node->GetScalingPivot(FbxNode::eSourcePivot));
    j.key("rotationOffset");
    writeVec4(j, node->GetRotationOffset(FbxNode::eSourcePivot));
    j.key("scalingOffset");
    writeVec4(j, node->GetScalingOffset(FbxNode::eSourcePivot));
    j.key("geometricTranslation");
    writeVec4(j, node->GetGeometricTranslation(FbxNode::eSourcePivot));
    j.key("geometricRotation");
    writeVec4(j, node->GetGeometricRotation(FbxNode::eSourcePivot));
    j.key("geometricScaling");
    writeVec4(j, node->GetGeometricScaling(FbxNode::eSourcePivot));
    j.key("localTransform");
    writeAMatrix(j, node->EvaluateLocalTransform());
}

static void dumpPose(JsonWriter& j, FbxPose* pose)
{
    j.key("bindPose").value(pose->IsBindPose());
    j.key("poseInfos");
    j.beginArray();
    for (int i = 0; i < pose->GetCount(); ++i) {
        j.beginObject();
        FbxNode* n = pose->GetNode(i);
        j.key("nodeId").value(n ? static_cast<long long>(Uid(n)) : -1ll);
        j.key("matrixIsLocal").value(pose->IsLocalMatrix(i));
        j.key("matrix");
        writeMatrix(j, pose->GetMatrix(i));
        j.endObject();
    }
    j.endArray();
}

static void dumpGlobalSettings(JsonWriter& j, FbxGlobalSettings* gs)
{
    FbxAxisSystem axis = gs->GetAxisSystem();
    int upSign = 0, frontSign = 0;
    const FbxAxisSystem::EUpVector up = axis.GetUpVector(upSign);
    const FbxAxisSystem::EFrontVector front = axis.GetFrontVector(frontSign);
    j.key("axisSystem");
    j.beginObject();
    j.key("upVector").value(static_cast<int>(up));
    j.key("upSign").value(upSign);
    j.key("frontVector").value(static_cast<int>(front));
    j.key("frontSign").value(frontSign);
    j.key("coordSystem").value(static_cast<int>(axis.GetCoorSystem()));
    j.endObject();
    const FbxSystemUnit unit = gs->GetSystemUnit();
    j.key("systemUnit");
    j.beginObject();
    j.key("scaleFactor").value(unit.GetScaleFactor());
    j.key("multiplier").value(unit.GetMultiplier());
    j.endObject();
    j.key("timeMode").value(static_cast<int>(gs->GetTimeMode()));
    j.key("timeProtocol").value(static_cast<int>(gs->GetTimeProtocol()));
    j.key("customFrameRate").value(gs->GetCustomFrameRate());
    const FbxColor ambient = gs->GetAmbientColor();
    j.key("ambientColor");
    writeColor(j, ambient);
    j.key("defaultCamera").value(gs->GetDefaultCamera().Buffer());
}

static void dumpTyped(JsonWriter& j, FbxObject* obj)
{
    j.key("typed");
    j.beginObject();
    if (FbxNode* node = FbxCast<FbxNode>(obj)) {
        dumpNode(j, node);
    } else if (FbxMesh* mesh = FbxCast<FbxMesh>(obj)) {
        dumpMesh(j, mesh);
    } else if (FbxNurbsCurve* nc = FbxCast<FbxNurbsCurve>(obj)) {
        dumpGeometryBase(j, nc);
        j.key("order").value(nc->GetOrder());
        j.key("dimension").value(static_cast<int>(nc->GetDimension()));
        j.key("form").value(static_cast<int>(nc->GetType()));
    } else if (FbxGeometryBase* gb = FbxCast<FbxGeometryBase>(obj)) {
        dumpGeometryBase(j, gb);
    } else if (FbxCluster* cluster = FbxCast<FbxCluster>(obj)) {
        dumpCluster(j, cluster);
    } else if (FbxSkin* skin = FbxCast<FbxSkin>(obj)) {
        j.key("skinningType").value(static_cast<int>(skin->GetSkinningType()));
        j.key("clusterIds");
        j.beginArray();
        for (int i = 0; i < skin->GetClusterCount(); ++i)
            j.value(static_cast<long long>(Uid(skin->GetCluster(i))));
        j.endArray();
    } else if (FbxBlendShape* bs = FbxCast<FbxBlendShape>(obj)) {
        j.key("channelIds");
        j.beginArray();
        for (int i = 0; i < bs->GetBlendShapeChannelCount(); ++i)
            j.value(static_cast<long long>(Uid(bs->GetBlendShapeChannel(i))));
        j.endArray();
    } else if (FbxBlendShapeChannel* ch = FbxCast<FbxBlendShapeChannel>(obj)) {
        j.key("shapeIds");
        j.beginArray();
        for (int i = 0; i < ch->GetTargetShapeCount(); ++i)
            j.value(static_cast<long long>(Uid(ch->GetTargetShape(i))));
        j.endArray();
        j.key("fullWeights");
        j.beginArray();
        double* w = ch->GetTargetShapeFullWeights();
        for (int i = 0; i < ch->GetTargetShapeCount(); ++i) j.value(w[i]);
        j.endArray();
    } else if (FbxAnimCurve* curve = FbxCast<FbxAnimCurve>(obj)) {
        dumpAnimCurve(j, curve);
    } else if (FbxAnimCurveNode* cn = FbxCast<FbxAnimCurveNode>(obj)) {
        dumpAnimCurveNode(j, cn);
    } else if (FbxAnimStack* stack = FbxCast<FbxAnimStack>(obj)) {
        const FbxTimeSpan local = stack->GetLocalTimeSpan();
        const FbxTimeSpan ref = stack->GetReferenceTimeSpan();
        j.key("localTimeSpan");
        j.beginObject();
        j.key("start").value(static_cast<long long>(local.GetStart().Get()));
        j.key("stop").value(static_cast<long long>(local.GetStop().Get()));
        j.endObject();
        j.key("referenceTimeSpan");
        j.beginObject();
        j.key("start").value(static_cast<long long>(ref.GetStart().Get()));
        j.key("stop").value(static_cast<long long>(ref.GetStop().Get()));
        j.endObject();
        j.key("layerIds");
        j.beginArray();
        for (int i = 0; i < stack->GetMemberCount<FbxAnimLayer>(); ++i)
            j.value(static_cast<long long>(Uid(stack->GetMember<FbxAnimLayer>(i))));
        j.endArray();
    } else if (FbxPose* pose = FbxCast<FbxPose>(obj)) {
        dumpPose(j, pose);
    } else if (FbxGlobalSettings* gs = FbxCast<FbxGlobalSettings>(obj)) {
        dumpGlobalSettings(j, gs);
    } else if (FbxSkeleton* sk = FbxCast<FbxSkeleton>(obj)) {
        j.key("skeletonType").value(static_cast<int>(sk->GetSkeletonType()));
    } else if (FbxNull* nullAttr = FbxCast<FbxNull>(obj)) {
        j.key("look").value(static_cast<int>(nullAttr->Look.Get()));
        j.key("size").value(nullAttr->Size.Get());
    } else if (FbxFileTexture* tex = FbxCast<FbxFileTexture>(obj)) {
        j.key("fileName").value(tex->GetFileName());
        j.key("relativeFileName").value(tex->GetRelativeFileName());
        j.key("swapUV").value(tex->GetSwapUV());
        j.key("alphaSource").value(static_cast<int>(tex->GetAlphaSource()));
        j.key("wrapU").value(static_cast<int>(tex->GetWrapModeU()));
        j.key("wrapV").value(static_cast<int>(tex->GetWrapModeV()));
    } else if (FbxVideo* video = FbxCast<FbxVideo>(obj)) {
        j.key("fileName").value(video->GetFileName().Buffer());
        j.key("relativeFileName").value(video->GetRelativeFileName().Buffer());
        j.key("width").value(video->GetWidth());
        j.key("height").value(video->GetHeight());
    } else if (FbxNodeAttribute* attr = FbxCast<FbxNodeAttribute>(obj)) {
        j.key("attributeType").value(static_cast<int>(attr->GetAttributeType()));
    } else if (FbxCollection* col = FbxCast<FbxCollection>(obj)) {
        j.key("memberIds");
        j.beginArray();
        for (int i = 0; i < col->GetMemberCount(); ++i)
            j.value(static_cast<long long>(Uid(col->GetMember(i))));
        j.endArray();
    }
    j.endObject();
}

static void dumpObject(JsonWriter& j, FbxObject* obj)
{
    j.beginObject();
    j.key("uniqueId").value(static_cast<long long>(Uid(obj)));
    j.key("name").value(obj->GetName());
    j.key("nameOnly").value(obj->GetNameWithoutNameSpacePrefix().Buffer());
    j.key("nameSpace").value(obj->GetNameSpaceOnly().Buffer());
    j.key("initialName").value(obj->GetInitialName());
    j.key("classId").value(obj->GetClassId().GetName());
    j.key("classIdParent").value(obj->GetClassId().GetParent().GetName());
    j.key("fbxType").value(obj->GetClassId().GetFbxFileTypeName());
    j.key("fbxSubType").value(obj->GetClassId().GetFbxFileSubTypeName());
    j.key("objectFlags").value(static_cast<unsigned>(obj->GetAllObjectFlags()));
    j.key("srcObjectIds");
    writeIdArray(j, obj, true);
    j.key("dstObjectIds");
    writeIdArray(j, obj, false);

    j.key("properties");
    j.beginArray();
    for (FbxProperty child = obj->RootProperty.GetChild(); child.IsValid(); child = child.GetSibling())
        dumpProperty(j, child);
    j.endArray();

    dumpTyped(j, obj);
    j.endObject();
}

struct Connection {
    const char* kind;
    unsigned long long src;
    unsigned long long dst;
    std::string srcProp;
    std::string dstProp;

    bool operator<(const Connection& o) const
    {
        if (src != o.src) return src < o.src;
        if (dst != o.dst) return dst < o.dst;
        const int k = std::strcmp(kind, o.kind);
        if (k != 0) return k < 0;
        if (srcProp != o.srcProp) return srcProp < o.srcProp;
        return dstProp < o.dstProp;
    }
};

static void collectConnections(FbxObject* obj, std::set<Connection>& out)
{
    for (int i = 0; i < obj->GetSrcObjectCount(); ++i) {
        if (FbxObject* src = obj->GetSrcObject(i))
            out.insert(Connection{ "OO", Uid(src), Uid(obj), "", "" });
    }
    for (int i = 0; i < obj->GetSrcPropertyCount(); ++i) {
        FbxProperty sp = obj->GetSrcProperty(i);
        if (!sp.IsValid()) continue;
        FbxObject* owner = sp.GetFbxObject();
        if (!owner) continue;
        out.insert(Connection{ "PO", Uid(owner), Uid(obj), sp.GetHierarchicalName().Buffer(), "" });
    }

    std::vector<FbxProperty> props;
    for (FbxProperty c = obj->RootProperty.GetChild(); c.IsValid(); c = c.GetSibling())
        props.push_back(c);
    for (size_t pi = 0; pi < props.size(); ++pi) {
        FbxProperty p = props[pi];
        for (int i = 0; i < p.GetSrcObjectCount(); ++i) {
            if (FbxObject* src = p.GetSrcObject(i))
                out.insert(Connection{ "OP", Uid(src), Uid(obj), "", p.GetHierarchicalName().Buffer() });
        }
        for (int i = 0; i < p.GetSrcPropertyCount(); ++i) {
            FbxProperty sp = p.GetSrcProperty(i);
            if (!sp.IsValid()) continue;
            FbxObject* owner = sp.GetFbxObject();
            if (!owner) continue;
            out.insert(Connection{
                "PP", Uid(owner), Uid(obj),
                sp.GetHierarchicalName().Buffer(),
                p.GetHierarchicalName().Buffer() });
        }
        for (FbxProperty c = p.GetChild(); c.IsValid(); c = c.GetSibling())
            props.push_back(c);
    }
}

static void collectObjects(FbxScene* scene, std::vector<FbxObject*>& ordered)
{
    std::map<unsigned long long, FbxObject*> byId;
    std::vector<FbxObject*> queue;
    std::set<unsigned long long> seen;

    auto push = [&](FbxObject* o) {
        if (!o) return;
        const unsigned long long id = Uid(o);
        if (!seen.insert(id).second) return;
        byId[id] = o;
        queue.push_back(o);
    };

    push(scene);
    push(&scene->GetGlobalSettings());
    push(scene->GetRootNode());
    if (scene->GetSceneInfo()) push(scene->GetSceneInfo());

    for (size_t qi = 0; qi < queue.size(); ++qi) {
        FbxObject* o = queue[qi];
        for (int i = 0; i < o->GetSrcObjectCount(); ++i) push(o->GetSrcObject(i));
        for (int i = 0; i < o->GetDstObjectCount(); ++i) push(o->GetDstObject(i));
        FbxProperty p = o->GetFirstProperty();
        while (p.IsValid()) {
            for (int i = 0; i < p.GetSrcObjectCount(); ++i) push(p.GetSrcObject(i));
            for (int i = 0; i < p.GetDstObjectCount(); ++i) push(p.GetDstObject(i));
            p = o->GetNextProperty(p);
        }
        if (FbxNode* n = FbxCast<FbxNode>(o)) {
            push(n->GetParent());
            for (int i = 0; i < n->GetChildCount(); ++i) push(n->GetChild(i));
            for (int i = 0; i < n->GetNodeAttributeCount(); ++i) push(n->GetNodeAttributeByIndex(i));
            for (int i = 0; i < n->GetMaterialCount(); ++i) push(n->GetMaterial(i));
        }
        if (FbxCollection* c = FbxCast<FbxCollection>(o)) {
            for (int i = 0; i < c->GetMemberCount(); ++i) push(c->GetMember(i));
        }
    }

    ordered.reserve(byId.size());
    for (auto& kv : byId) ordered.push_back(kv.second);
}

static const char* detectFormat(const char* path)
{
    FILE* f = std::fopen(path, "rb");
    if (!f) return "unknown";
    char buf[24] = {};
    const size_t n = std::fread(buf, 1, 23, f);
    std::fclose(f);
    if (n >= 20 && std::memcmp(buf, "Kaydara FBX Binary", 18) == 0) return "binary";
    return "ascii";
}

static std::string defaultOutPath(const std::string& in)
{
    const std::string suffix = ".sdk.json";
    const size_t slash = in.find_last_of("\\/");
    const size_t dot = in.find_last_of('.');
    if (dot != std::string::npos && (slash == std::string::npos || dot > slash))
        return in.substr(0, dot) + suffix;
    return in + suffix;
}

static void printUsage()
{
    std::fprintf(stderr,
        "fbx-dump — dump Autodesk FBX SDK scene to JSON\n"
        "Usage: fbx-dump <file.fbx> [-o out.json] [--compact] [--stdout]\n");
}

int main(int argc, char** argv)
{
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif

    std::string inPath;
    std::string outPath;
    bool compact = false;
    bool toStdout = false;

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "-h" || a == "--help") {
            printUsage();
            return 0;
        }
        if (a == "--compact") compact = true;
        else if (a == "--stdout") toStdout = true;
        else if (a == "-o" && i + 1 < argc) outPath = argv[++i];
        else if (a[0] != '-') inPath = a;
        else {
            std::fprintf(stderr, "Unknown arg: %s\n", a.c_str());
            printUsage();
            return 2;
        }
    }

    if (inPath.empty()) {
        printUsage();
        return 2;
    }
    if (outPath.empty() && !toStdout) outPath = defaultOutPath(inPath);

    FbxManager* manager = FbxManager::Create();
    if (!manager) {
        std::fprintf(stderr, "Unable to create FbxManager\n");
        return 1;
    }
    FbxIOSettings* ios = FbxIOSettings::Create(manager, IOSROOT);
    manager->SetIOSettings(ios);
    ios->SetBoolProp(IMP_FBX_MATERIAL, true);
    ios->SetBoolProp(IMP_FBX_TEXTURE, true);
    ios->SetBoolProp(IMP_FBX_LINK, true);
    ios->SetBoolProp(IMP_FBX_SHAPE, true);
    ios->SetBoolProp(IMP_FBX_GOBO, true);
    ios->SetBoolProp(IMP_FBX_ANIMATION, true);
    ios->SetBoolProp(IMP_FBX_GLOBAL_SETTINGS, true);

    FbxScene* scene = FbxScene::Create(manager, "Scene");
    FbxImporter* importer = FbxImporter::Create(manager, "");
    if (!importer->Initialize(inPath.c_str(), -1, manager->GetIOSettings())) {
        std::fprintf(stderr, "Initialize failed: %s\n", importer->GetStatus().GetErrorString());
        manager->Destroy();
        return 1;
    }

    int fileMajor = 0, fileMinor = 0, fileRevision = 0;
    importer->GetFileVersion(fileMajor, fileMinor, fileRevision);
    FbxIOFileHeaderInfo* header = importer->GetFileHeaderInfo();
    const char* creator = (header && header->mCreator.Buffer()) ? header->mCreator.Buffer() : "";
    const int headerVersion = header ? header->mFileVersion : 0;
    const int animStackCount = importer->GetAnimStackCount();
    const FbxString activeStack = importer->GetActiveAnimStackName();

    std::vector<std::string> takeNames;
    for (int i = 0; i < animStackCount; ++i) {
        if (FbxTakeInfo* take = importer->GetTakeInfo(i))
            takeNames.push_back(take->mName.Buffer());
    }

    if (!importer->Import(scene)) {
        std::fprintf(stderr, "Import failed: %s\n", importer->GetStatus().GetErrorString());
        manager->Destroy();
        return 1;
    }
    importer->Destroy();

    std::vector<FbxObject*> objects;
    collectObjects(scene, objects);

    std::set<Connection> conns;
    for (FbxObject* o : objects) collectConnections(o, conns);

    std::ostream* os = nullptr;
    std::ofstream file;
    if (toStdout || outPath == "-") {
        os = &std::cout;
    } else {
        file.open(outPath.c_str(), std::ios::binary);
        if (!file) {
            std::fprintf(stderr, "Cannot write %s\n", outPath.c_str());
            manager->Destroy();
            return 1;
        }
        os = &file;
    }

    JsonWriter j(*os, compact);
    j.beginObject();
    j.key("sdkVersion").value(manager->GetVersion());
    j.key("file");
    j.beginObject();
    j.key("path").value(inPath);
    j.key("format").value(detectFormat(inPath.c_str()));
    j.key("major").value(fileMajor);
    j.key("minor").value(fileMinor);
    j.key("revision").value(fileRevision);
    j.key("fileVersion").value(fileMajor * 1000 + fileMinor * 100 + fileRevision);
    j.key("headerFileVersion").value(headerVersion);
    j.key("creator").value(creator);
    j.key("animStackCount").value(animStackCount);
    j.key("activeAnimStack").value(activeStack.Buffer());
    j.key("takes");
    j.beginArray();
    for (const auto& t : takeNames) j.value(t);
    j.endArray();
    j.endObject();

    j.key("scene");
    j.beginObject();
    j.key("uniqueId").value(static_cast<long long>(Uid(scene)));
    j.key("name").value(scene->GetName());
    j.key("rootNodeId").value(static_cast<long long>(Uid(scene->GetRootNode())));
    j.key("globalSettingsId").value(static_cast<long long>(Uid(&scene->GetGlobalSettings())));
    if (scene->GetSceneInfo())
        j.key("documentInfoId").value(static_cast<long long>(Uid(scene->GetSceneInfo())));
    j.endObject();

    j.key("objectCount").value(static_cast<int>(objects.size()));
    j.key("objects");
    j.beginArray();
    for (FbxObject* o : objects) dumpObject(j, o);
    j.endArray();

    j.key("connections");
    j.beginArray();
    for (const Connection& c : conns) {
        j.beginObject();
        j.key("kind").value(c.kind);
        j.key("src").value(static_cast<long long>(c.src));
        j.key("dst").value(static_cast<long long>(c.dst));
        if (!c.srcProp.empty()) j.key("srcProp").value(c.srcProp);
        if (!c.dstProp.empty()) j.key("dstProp").value(c.dstProp);
        j.endObject();
    }
    j.endArray();
    j.endObject();
    if (!compact) *os << '\n';

    if (file.is_open()) {
        std::fprintf(stderr, "Wrote %s (%zu objects, %zu connections)\n",
            outPath.c_str(), objects.size(), conns.size());
    }

    manager->Destroy();
    return 0;
}
