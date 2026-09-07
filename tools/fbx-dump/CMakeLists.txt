cmake_minimum_required(VERSION 3.15)
project(fbx-dump LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT FBX_SDK_ROOT)
  if(DEFINED ENV{FBX_SDK_ROOT} AND NOT "$ENV{FBX_SDK_ROOT}" STREQUAL "")
    set(FBX_SDK_ROOT "$ENV{FBX_SDK_ROOT}")
  elseif(DEFINED ENV{FBXSDK_ROOT} AND NOT "$ENV{FBXSDK_ROOT}" STREQUAL "")
    set(FBX_SDK_ROOT "$ENV{FBXSDK_ROOT}")
  endif()
endif()

if(NOT FBX_SDK_ROOT)
  message(FATAL_ERROR
    "FBX SDK not located. Set FBX_SDK_ROOT (or FBXSDK_ROOT), "
    "or pass -DFBX_SDK_ROOT=<path>.")
endif()

file(TO_CMAKE_PATH "${FBX_SDK_ROOT}" FBX_SDK_ROOT)
set(FBX_SDK_ROOT "${FBX_SDK_ROOT}" CACHE PATH "Autodesk FBX SDK root")

if(NOT EXISTS "${FBX_SDK_ROOT}/include/fbxsdk.h")
  message(FATAL_ERROR
    "FBX SDK not found at '${FBX_SDK_ROOT}' (missing include/fbxsdk.h).")
endif()

set(FBX_LIB_DIR "${FBX_SDK_ROOT}/lib/vs2019/x64/release")

add_executable(fbx-dump src/main.cpp)
target_include_directories(fbx-dump PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${FBX_SDK_ROOT}/include"
)
target_compile_definitions(fbx-dump PRIVATE
    _CRT_SECURE_NO_WARNINGS
    NOMINMAX
)

if(MSVC)
    target_compile_options(fbx-dump PRIVATE /utf-8 /EHsc /bigobj /W3)
    set_property(TARGET fbx-dump PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif()

target_link_libraries(fbx-dump PRIVATE
    "${FBX_LIB_DIR}/libfbxsdk-md.lib"
    "${FBX_LIB_DIR}/libxml2-md.lib"
    "${FBX_LIB_DIR}/zlib-md.lib"
)

if(WIN32)
    target_link_libraries(fbx-dump PRIVATE advapi32)
endif()
